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
import { refactorSkuListFunc } from "../../helper/data-output-helper/index.js";
import { getDataTsvFile } from "../../helper/tsv-helper/index.js";
import {
  getFileType,
  cogsJsonToXlsx,
  xlsxToJSON,
  createExcelBuffer,
} from "../../helper/xlsx-helper/index.js";
import {
  FILE_TYPE,
  inputKeyName,
  KEY_PREFERENCES,
  SHIPMENT_OUTPUT_COL_ALPHABET,
  SHIPMENT_OUTPUT_KEY_NAME,
} from "../../shared/constant.js";
import {
  MISSING_ORDER_1_FILE,
  MISSING_SKU_LIST_FILE,
  MISSING_TSV_FILE,
} from "../../shared/err-const.js";
import { isEmptyValue, mergeArrays, now } from "../../shared/utils.js";
import JSZip from "jszip";

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

  let shipment;
  const zip = new JSZip();

  try {
    files = files.map((file) => {
      const fileType = getFileType(file);
      return { ...file, fileType };
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
      ];

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

      let allElements = skuList
        .map((sku) => {
          let { elements = [], quantity } = sku;
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
        const { quantity, usdPrice, cnyPrice } = element;
        const totalUsd = `${usdPrice} * ${quantity}`;
        const totalCny = `${cnyPrice} * ${quantity}`;
        return { ...element, totalCny, totalUsd };
      });

      inputShippingCost.forEach((item) => {
        const { isDomestic, shipment } = item;
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
          isDomestic ? "Domestic" : "International"
        } shipping cost ${shipment}`;
        let shippingElement = {
          name: shippingName,
          // totalCny,
          // totalUsd,
        };
        if (totalShipmentCny) {
          shippingElement.totalCny = totalCny;
        }
        if (totalShipmentUsd) {
          shippingElement.totalUsd = totalUsd;
        }
        allElements.push(shippingElement);
      });

      const totalElement = {};

      skuList = removeSkuKey(skuList);

      allElements = refactorAllElements(allElements);
      const shipmentResultFileBuffer = await createExcelBuffer(allElements);
      zip.file(`Shipment - ${originalShipment}.xlsx`, shipmentResultFileBuffer);

      mergeSkuList = [...mergeSkuList, ...skuList];
    }

    const refactorSkuList = refactorSkuListFunc(mergeSkuList);
    const cogsXlsxBuffer = await cogsJsonToXlsx({ json: refactorSkuList });
    zip.file(`${shipment}-cogs.xlsx`, cogsXlsxBuffer);

    const zipFile = zip.generateAsync({ type: "nodebuffer" });
    return zipFile;
    return xlsxBuffer;
    return { xlsxBuffer, shipment, shipmentId };
  } catch (err) {
    console.log(`${now()}: [${err}]`);
    throw new BadRequestError(err.message);
  }
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
      const rawJson = xlsxToJSON({
        file: shippingFile,
        paymentCostKeyName: inputKeyName.totalUsd,
        exchangeRateKeyName: inputKeyName.totalUsd,
        isShippingFile: true,
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
    const rawOrder1Data = xlsxToJSON({
      file: order1File,
      exchangeRateKeyName: inputKeyName.totalUsd,
    });
    rawJsonOrder1 = [...rawJsonOrder1, ...rawOrder1Data];
  }
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

const refactorAllElements = (allElements = []) => {
  return allElements.map((element, index) => {
    const { name, quantity, cnyPrice, usdPrice, totalCny, totalUsd } = element;
    return {
      [SHIPMENT_OUTPUT_KEY_NAME.NO]: index + 1,
      [SHIPMENT_OUTPUT_KEY_NAME.PRODUCT_NAME]: name,
      [SHIPMENT_OUTPUT_KEY_NAME.IMAGE]: "",
      [SHIPMENT_OUTPUT_KEY_NAME.QUANTITY]: quantity,
      [SHIPMENT_OUTPUT_KEY_NAME.CNY_PRICE]: cnyPrice,
      [SHIPMENT_OUTPUT_KEY_NAME.USD_PRICE]: usdPrice,
      [SHIPMENT_OUTPUT_KEY_NAME.TOTAL_CNY]: totalCny,
      [SHIPMENT_OUTPUT_KEY_NAME.TOTAL_USD]: totalUsd,
    };
  });
};
