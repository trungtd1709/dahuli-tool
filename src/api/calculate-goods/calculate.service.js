import JSZip from "jszip";
import _ from "lodash";
import { BadRequestError } from "../../error/bad-request-err.js";
import {
  addCogsAndAmount,
  addCustomizeCost,
  addPackingCost,
  addShippingAndPaymentCost,
  addTotalAmountAndQuantity,
  calculatePpuPrice,
  removeObjKey,
} from "../../helper/calculate-helper/index.js";
import {
  transformOrderList1Input,
  transformShipmentListInput,
  transformShippingCostInput,
  transformSkuListInput,
} from "../../helper/data-input-helper/index.js";
import {
  refactorElements,
  refactorSkuListFunc,
} from "../../helper/data-output-helper/index.js";
import { getDataTsvFile } from "../../helper/tsv-helper/index.js";
import {
  cogsJsonToXlsx,
  createShipmentExcelBuffer,
  getFileType,
  modifyShipmentFile,
  modifyShippingFile,
  xlsxToJSON,
} from "../../helper/xlsx-handler/index.js";
import {
  FILE_TYPE,
  KEY_PREFERENCES,
  OUTPUT_KEY_NAME,
  inputKeyName,
} from "../../shared/constant.js";
import {
  MISSING_ORDER_1_FILE,
  MISSING_SKU_LIST_FILE,
  MISSING_TSV_FILE,
} from "../../shared/err-const.js";
import { isEmptyValue, mergeArrays, now } from "../../shared/utils.js";
import { InputShippingCost } from "../../model/index.js";

/**
 * @param {Array.<Express.Multer.File>} files - An array of Multer file objects.
 * @returns {Promise<>}
 */
export const calculateGood = async (files = []) => {
  let mergeSkuList = [];
  let totalShipmentQuantity = 0;
  let totalSkuList = [];
  let rawInputShippingCost = [];
  let rawJsonOrder1 = [];
  let shipmentData = [];
  let allInputShippingCost = [];

  let shipment;
  const zip = new JSZip();

  try {
    files = files.map((file) => {
      const fileType = getFileType(file);
      const order = file.originalname.split("-")[0];
      return { ...file, fileType, order };
    });

    const tsvFilesArr = getTsvFilesArr(files);
    totalSkuList = getTotalSkuList(files);
    rawInputShippingCost = getRawInputShippingCost(files);
    rawJsonOrder1 = getRawOrder1Data(files);
    shipmentData = getShipmentData(files);

    // tổng các loại sku
    let totalSkuType = 0;
    let inputTsvDataArr = [];
    for (const tsvFile of tsvFilesArr) {
      const { shipmentQuantity, inputTsvData } = await getDataTsvFile({
        file: tsvFile,
      });
      totalShipmentQuantity += shipmentQuantity;
      inputTsvDataArr.push(inputTsvData);

      const thisTsvSkuList = mergeArrays(
        inputTsvData,
        totalSkuList,
        inputKeyName.sku
      ).filter((item) => !_.isEmpty(item?.elements));
      totalSkuType += thisTsvSkuList.length;
    }

    let shipmentObjAddToOrder = {};

    for (const inputTsvData of inputTsvDataArr) {
      let inputShippingCost = [];
      let skuList = totalSkuList;
      let elementsPrice = [];
      shipment = "";
      let originalShipment, shipmentId;
      shipmentId = inputTsvData[0].shipmentId;

      if (!isEmptyValue(shipmentData)) {
        const shipmentObj = shipmentData.find(
          (item) => item?.shipmentId == shipmentId
        );
        shipment = shipmentObj?.shipment;
        originalShipment = shipmentObj?.originalShipment;
      }

      inputShippingCost = transformShippingCostInput(
        rawInputShippingCost,
        shipmentId,
        shipment,
        totalShipmentQuantity
      );

      const totalOrder1Data = transformOrderList1Input(
        rawJsonOrder1,
        shipmentId
      );
      const {
        elementsPriceArr = [],
        domesticShippingCostArr = [],
        internationalShippingCostArr = [],
        packingLabelingCostArr = [],
      } = totalOrder1Data;
      elementsPrice = [
        ...elementsPriceArr,
        ...elementsPrice,
        ...packingLabelingCostArr,
      ];
      inputShippingCost = [
        ...inputShippingCost,
        ...domesticShippingCostArr,
        ...internationalShippingCostArr,
      ].sort((a, b) => {
        return b?.isDomestic - a?.isDomestic;
      });

      allInputShippingCost = [allInputShippingCost, ...inputShippingCost];

      skuList = mergeArrays(inputTsvData, skuList, inputKeyName.sku).filter(
        (item) => !_.isEmpty(item?.elements)
      );

      skuList = skuList.map((item) => {
        return { ...item, shipmentId, originalShipment: originalShipment };
      });

      skuList = calculatePpuPrice(skuList, elementsPrice);
      skuList = addCustomizeCost(skuList, elementsPrice);
      skuList = addPackingCost(skuList, elementsPrice);
      skuList = addShippingAndPaymentCost(
        skuList,
        inputShippingCost,
        totalSkuType
      );
      skuList = addCogsAndAmount(skuList);
      skuList = addTotalAmountAndQuantity(skuList);

      const allElements = await addShipmentResultFileToZip(
        skuList,
        inputShippingCost,
        originalShipment,
        totalShipmentQuantity,
        elementsPrice,
        zip
      );

      shipmentObjAddToOrder[originalShipment] = allElements;

      skuList = removeSkuKey(skuList);
      mergeSkuList = [...mergeSkuList, ...skuList];
    }

    console.log(shipmentObjAddToOrder);

    const refactorSkuList = refactorSkuListFunc(mergeSkuList);
    const cogsXlsxBuffer = await cogsJsonToXlsx({ json: refactorSkuList });
    zip.file(`${shipment}-cogs.xlsx`, cogsXlsxBuffer);

    const order1Files = files.filter(
      (file) => file.fileType == FILE_TYPE.ORDER_1
    );

    for (const order1File of order1Files) {
      const newOrderBuffer = await modifyShipmentFile(
        order1File,
        shipmentObjAddToOrder
      );
      zip.file(order1File.originalname, newOrderBuffer);
    }

    allInputShippingCost = allInputShippingCost.map((inputShippingCost) => {
      return InputShippingCost.fromJson(inputShippingCost);
    });

    const shippingFiles = files.filter(
      (file) => file.fileType == FILE_TYPE.SHIPPING
    );

    for (const shippingFile of shippingFiles) {
      const newShippingBuffer = await modifyShippingFile(
        shippingFile,
        shipmentObjAddToOrder,
        allInputShippingCost,
        inputTsvDataArr
      );
      zip.file(shippingFile.originalname, newShippingBuffer);
    }

    const zipFile = zip.generateAsync({ type: "nodebuffer" });
    return zipFile;
  } catch (err) {
    console.log(`${now()}: [${err.stack}]`);
    throw new BadRequestError(err.message);
  }
};

const addShipmentResultFileToZip = async (
  skuList,
  inputShippingCost,
  originalShipment,
  totalShipmentQuantity,
  elementsPrice = [],
  zip
) => {
  let allElements = skuList
    .map((sku) => {
      const {
        customizePackage = "",
        customPackageCost = "",
        cnyCustomPackageCost = "",
      } = sku;
      let { elements = [], quantity } = sku;

      if (!isEmptyValue(customizePackage)) {
        const customizePackageObj = {
          name: customizePackage,
          quantity: 1,
          cnyPrice: cnyCustomPackageCost,
          usdPrice: customPackageCost,
        };
        elements = [...elements, customizePackageObj];
      }
      elements = elements.map((element) => {
        const elementQuantity = element?.quantity ?? 0;
        const totalElementQuantity = elementQuantity * quantity;
        return { ...element, quantity: totalElementQuantity };
      });
      return elements;
    })
    .flat();

  allElements = Object.values(
    allElements.reduce((accumulator, current) => {
      if (accumulator[current.name]) {
        accumulator[current.name].quantity += current.quantity;
      } else {
        accumulator[current.name] = { ...current };
      }
      return accumulator;
    }, {})
  );

  allElements = allElements.map((element) => {
    const { name, quantity, usdPrice, cnyPrice } = element;
    const elementPriceObj = elementsPrice.find(
      (item) => item?.name?.toLowerCase() == name?.toLowerCase()
    );
    let order = "";
    if (!isEmptyValue(elementPriceObj)) {
      order = elementPriceObj?.order;
    }
    const totalUsd = `${usdPrice} * ${quantity}`;
    const totalCny = `${cnyPrice} * ${quantity}`;
    return { ...element, totalCny, totalUsd, order };
  });

  inputShippingCost.forEach((item) => {
    const { isDomestic, order = "" } = item;
    const totalShipmentUsd = item?.totalUsd;
    const totalShipmentCny = item?.totalCny;

    let shipmentSkuQuantity = 0;
    skuList.forEach((item) => {
      const { quantity = 0 } = item;
      shipmentSkuQuantity += quantity;
    });

    const totalCny = `${totalShipmentCny} / ${totalShipmentQuantity} * ${shipmentSkuQuantity}`;
    const totalUsd = `${totalShipmentUsd} / ${totalShipmentQuantity} * ${shipmentSkuQuantity}`;

    const shippingName = `${
      isDomestic
        ? OUTPUT_KEY_NAME.DOMESTIC_SHIPPING_COST
        : OUTPUT_KEY_NAME.INTERNATIONAL_SHIPPING_COST
    } ${originalShipment}`;
    let shippingElement = {
      name: shippingName,
      order,
    };
    shippingElement.totalCny = totalShipmentCny ? totalCny : "";
    shippingElement.totalUsd = totalShipmentUsd ? totalUsd : "";
    allElements.push(shippingElement);
  });

  skuList = removeSkuKey(skuList);
  const refactorAllElements = refactorElements(allElements);
  const shipmentResultFileBuffer = await createShipmentExcelBuffer(
    refactorAllElements
  );
  zip.file(`Shipment - ${originalShipment}.xlsx`, shipmentResultFileBuffer);
  return allElements;
};

const removeSkuKey = (skuList = []) => {
  skuList = removeObjKey(skuList, inputKeyName.elements);
  skuList = removeObjKey(skuList, KEY_PREFERENCES.packing);
  skuList = removeObjKey(skuList, "customizePackage");
  return skuList;
};

const getRawInputShippingCost = (files = []) => {
  let rawInputShippingCost = [];
  const shippingListFiles = files.filter(
    (file) => file.fileType == FILE_TYPE.SHIPPING
  );

  if (!isEmptyValue(shippingListFiles)) {
    shippingListFiles.forEach((shippingFile) => {
      const { order } = shippingFile;
      const rawJson = xlsxToJSON({
        file: shippingFile,
        paymentCostKeyName: inputKeyName.totalUsd,
        exchangeRateKeyName: inputKeyName.totalUsd,
        isShippingFile: true,
      }).map((item) => {
        return { ...item, order };
      });
      rawInputShippingCost = [...rawInputShippingCost, ...rawJson];
    });
  }
  return rawInputShippingCost;
};

const getTotalSkuList = (files = []) => {
  let totalSkuList = [];
  const skuListFiles = files.filter(
    (file) => file.fileType == FILE_TYPE.SKU_LIST
  );
  if (isEmptyValue(skuListFiles)) {
    throw new BadRequestError(MISSING_SKU_LIST_FILE);
  }

  skuListFiles.forEach((skuListFile) => {
    const rawSkuListData = xlsxToJSON({ file: skuListFile });
    totalSkuList = [...totalSkuList, ...rawSkuListData];
    // raw skulist json
  });
  totalSkuList = transformSkuListInput(totalSkuList);

  return totalSkuList;
};

const getRawOrder1Data = (files = []) => {
  let rawJsonOrder1 = [];
  const order1Files = files.filter(
    (file) => file.fileType == FILE_TYPE.ORDER_1
  );
  if (isEmptyValue(order1Files)) {
    throw new BadRequestError(MISSING_ORDER_1_FILE);
  }

  for (const order1File of order1Files) {
    const { order } = order1File;
    const rawOrder1Data = xlsxToJSON({
      file: order1File,
      exchangeRateKeyName: inputKeyName.totalUsd,
    }).map((item) => {
      return { ...item, order };
    });
    rawJsonOrder1 = [...rawJsonOrder1, ...rawOrder1Data];
  }
  rawJsonOrder1 = rawJsonOrder1.filter((item) => {
    return !isEmptyValue(item?.productName);
  });
  return rawJsonOrder1;
};

const getShipmentData = (files = []) => {
  let shipmentData = [];
  const shipmentFile = files.find(
    (file) => file.fileType == FILE_TYPE.SHIPMENT
  );

  if (!isEmptyValue(shipmentFile)) {
    shipmentData = transformShipmentListInput(
      xlsxToJSON({ file: shipmentFile })
    );
  }

  return shipmentData;
};

const getTsvFilesArr = (files = []) => {
  const tsvFilesArr = files.filter((file) => file.fileType == FILE_TYPE.TSV);
  if (isEmptyValue(tsvFilesArr)) {
    throw new BadRequestError(MISSING_TSV_FILE);
  }
  return tsvFilesArr;
};
