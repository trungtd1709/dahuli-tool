import JSZip from "jszip";
import {
  FILE_TYPE,
  INPUT_KEY_NAME,
  KEY_PREFERENCES,
  OUTPUT_COL_ALPHABET,
  OUTPUT_KEY_NAME,
  SHIPMENT_OUTPUT_KEY_NAME,
} from "../../shared/constant.js";
import { getUniqueValueFromObjArr, isEmptyValue } from "../../shared/utils.js";
import {
  cogsJsonToXlsx,
  createShipmentExcelBuffer,
  modifyOrder1File,
  modifyShippingFile,
} from "../xlsx-handler/index.js";
import { extractNumberFromFilename } from "../data-input-helper/index.js";
import _ from "lodash";

/**
 *
 * @param {Array} skuList
 * @returns
 */
const refactorSkuListFunc = (skuList = []) => {
  const shipmentArr = getUniqueValueFromObjArr(skuList, "shipment");
  console.log(shipmentArr);
  if (!isEmptyValue(shipmentArr)) {
    shipmentArr.map((shipment) => {
      const shipmentFirstIndex = _.findIndex(skuList, { shipment });
      const shipmentLastIndex = _.findLastIndex(skuList, { shipment });
      for (let i = shipmentFirstIndex; i <= shipmentLastIndex; i++) {
        let sku = skuList[i];
        let { domesticShippingCost, internationalShippingCost } = sku;
        const colLetter = OUTPUT_COL_ALPHABET.TOTAL_UNIT;
        const originalFirstCell = `${colLetter}2`;
        const originalLastCell = `${colLetter}${
          skuList.length + 1
        }`;
        const newFirstCell = `${colLetter}${shipmentFirstIndex}`;
        const newLastCell = `${colLetter}${shipmentLastIndex}`;
      }
    });
  }
  let refactorSkuList = skuList.map((item) => {
    const {
      SKU,
      quantity,
      shipmentId,
      ppuPrice,
      customPackageCost,
      packingLabelingCost,
      domesticShippingCost,
      internationalShippingCost,
      itemPaymentCost,
      cogs,
      amount,
      totalAmount,
      totalQuantity,
      originalShipment,
    } = item;

    const refactorObj = {
      [OUTPUT_KEY_NAME.SKU]: SKU,
      [OUTPUT_KEY_NAME.SHIPMENT_ID]: shipmentId,
      [OUTPUT_KEY_NAME.QUANTITY]: quantity,
      [OUTPUT_KEY_NAME.NOTE]: originalShipment,
      [OUTPUT_KEY_NAME.PPU]: ppuPrice,
      [OUTPUT_KEY_NAME.CUSTOM_PACKAGE_COST]: customPackageCost,
      [OUTPUT_KEY_NAME.PACKING_LABELING_COST]: packingLabelingCost,
      [OUTPUT_KEY_NAME.DOMESTIC_SHIPPING_COST]: domesticShippingCost,
      [OUTPUT_KEY_NAME.INTERNATIONAL_SHIPPING_COST]: internationalShippingCost,
      [OUTPUT_KEY_NAME.PAYMENT_COST]: itemPaymentCost,
      [OUTPUT_KEY_NAME.COGS]: cogs,
      [OUTPUT_KEY_NAME.TOTAL_UNIT]: totalQuantity,
      [OUTPUT_KEY_NAME.AMOUNT]: amount,
      [OUTPUT_KEY_NAME.TOTAL_AMOUNT]: isEmptyValue(totalAmount)
        ? ""
        : totalAmount,
    };
    return refactorObj;
  });

  refactorSkuList.sort((a, b) => {
    if (a?.[OUTPUT_KEY_NAME.NOTE] < b?.[OUTPUT_KEY_NAME.NOTE]) return -1;
    if (a?.[OUTPUT_KEY_NAME.NOTE] > b?.[OUTPUT_KEY_NAME.NOTE]) return 1;
    return 0;
  });

  return refactorSkuList;
};

export const refactorElements = (allElements = []) => {
  return allElements.map((element, index) => {
    const {
      name,
      quantity,
      cnyPrice,
      usdPrice,
      totalCny,
      totalUsd,
      order = "",
    } = element;
    return {
      [SHIPMENT_OUTPUT_KEY_NAME.NO]: index + 1,
      [SHIPMENT_OUTPUT_KEY_NAME.PRODUCT_NAME]: name,
      [SHIPMENT_OUTPUT_KEY_NAME.IMAGE]: "",
      [SHIPMENT_OUTPUT_KEY_NAME.QUANTITY]: quantity,
      [SHIPMENT_OUTPUT_KEY_NAME.CNY_PRICE]: cnyPrice,
      [SHIPMENT_OUTPUT_KEY_NAME.USD_PRICE]: usdPrice,
      [SHIPMENT_OUTPUT_KEY_NAME.TOTAL_CNY]: totalCny,
      [SHIPMENT_OUTPUT_KEY_NAME.TOTAL_USD]: totalUsd,
      [SHIPMENT_OUTPUT_KEY_NAME.ORDER]: order,
      [SHIPMENT_OUTPUT_KEY_NAME.NOTE]: "",
    };
  });
};

export const removeSkuKey = (skuList = []) => {
  skuList = removeObjKey(skuList, INPUT_KEY_NAME.ELEMENTS);
  skuList = removeObjKey(skuList, KEY_PREFERENCES.PACKING);
  skuList = removeObjKey(skuList, "customizePackage");
  return skuList;
};

const removeObjKey = (skuList, keyName) => {
  return skuList.map((item) => {
    delete item[keyName];
    return item;
  });
};

/**
 *
 * @param {Array.<Express.Multer.File>} files
 * @param {JSZip} zip
 */
export const addOrder1FileToZip = async (
  files = [],
  zip,
  shipmentObjAddToOrder
) => {
  //
  let fileIndexNeedToChange = 0;
  const order1Files = files
    .filter((file) => file.fileType === FILE_TYPE.ORDER_1)
    .sort((fileA, fileB) => {
      const numA = extractNumberFromFilename(fileA.originalname);
      const numB = extractNumberFromFilename(fileB.originalname);
      // If both files have numbers, compare them numerically
      if (numA !== null && numB !== null) {
        return Number(numA) - Number(numB);
      }
      // If only one file has a number, that one should come first
      if (numA !== null) return -1;
      if (numB !== null) return 1;
      // If neither file has a number, keep the original order
      return 0;
    });

  for (let i = 0; i < order1Files.length; i++) {
    const order1File = order1Files[i];

    if (i == fileIndexNeedToChange) {
      const { modifiedBuffer, negativeInStockPlaceArr } =
        await modifyOrder1File(order1File, shipmentObjAddToOrder);
      zip.file(order1File.originalname, modifiedBuffer);
      if (negativeInStockPlaceArr.length > 0) {
        fileIndexNeedToChange += 1;
      }
    } else {
      zip.file(order1File.originalname, order1File.buffer);
    }
  }
};

/**
 * @param {Array.<Express.Multer.File>} files
 * @param {JSZip} zip
 */
export const addShippingFileToZip = async (
  files = [],
  zip,
  shipmentObjAddToOrder,
  allInputShippingCost,
  inputTsvDataArr
) => {
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
};

/**
 *
 * @param {*} skuList
 * @param {JSZip} zip
 */
export const addCogsFileToZip = async (skuList, zip, shipment) => {
  const refactorSkuList = refactorSkuListFunc(skuList);
  const cogsXlsxBuffer = await cogsJsonToXlsx({ json: refactorSkuList });
  zip.file(`${shipment}-cogs.xlsx`, cogsXlsxBuffer);
};

/**
 * Calculates the total price to make each object.
 * @param {Array<ElementPrice>} elementsPrice - The array of element prices.
 */
export const addShipmentFileAndGetAllElements = async (
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
        customPackageOrder = "",
        totalUsdCustomPackageCost = "",
        totalCnyCustomPackageCost = "",
      } = sku;
      let { elements = [], quantity } = sku;

      if (customizePackage) {
        const customizePackageObj = {
          name: customizePackage,
          quantity: 1,
          cnyPrice: cnyCustomPackageCost,
          usdPrice: customPackageCost,
          order: customPackageOrder,
          totalCny: totalCnyCustomPackageCost,
          totalUsd: totalUsdCustomPackageCost,
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

  // add up quantity các thành phần
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
    let { name, quantity, usdPrice, cnyPrice, totalCny, totalUsd } = element;
    const elementPriceObj = elementsPrice.find(
      (item) => item?.name?.toLowerCase() == name?.toLowerCase()
    );
    totalCny = totalCny.replace("totalElementQuantity", quantity);
    totalUsd = totalUsd.replace("totalElementQuantity", quantity);
    if (!isEmptyValue(elementPriceObj)) {
      usdPrice = elementPriceObj.getUsdFormula();
      cnyPrice = elementPriceObj.cnyPrice;
    }
    return { ...element, usdPrice, cnyPrice, totalCny, totalUsd };
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
      quantity: shipmentSkuQuantity,
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
