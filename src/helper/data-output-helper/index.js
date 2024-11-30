import JSZip from "jszip";
import {
  FILE_TYPE,
  INPUT_KEY_NAME,
  KEY_PREFERENCES,
  OUTPUT_COL_ALPHABET,
  OUTPUT_KEY_NAME,
  SHIPMENT_OUTPUT_COL_ALPHABET,
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

/// Nếu đợt file gồm nhiều shipment thì phải đổi công thức
const checkMultipleShipmentAndChange = (skuList = []) => {
  const fillInByOriginalShipment = true;
  const shipmentArr = getUniqueValueFromObjArr(
    skuList,
    fillInByOriginalShipment ? "originalShipment" : "shipment"
  );

  if (shipmentArr.length > 1) {
    shipmentArr.map((shipment) => {
      // orginal shipment thì điền total unit và total amount trong COGS theo shipment nhỏ, ví dụ S465.1
      // shipment thì điền total unit và total amount trong COGS theo shipment, ví dụ S306

      const predicate = (sku) => {
        return fillInByOriginalShipment
          ? sku?.originalShipment === shipment
          : sku?.shipment === shipment;
      };

      const shipmentFirstIndex = _.findIndex(skuList, (sku) => {
        return predicate(sku);
      });

      const shipmentLastIndex = _.findLastIndex(skuList, (sku) => {
        return predicate(sku);
      });

      for (let i = shipmentFirstIndex; i <= shipmentLastIndex; i++) {
        // cột đầu tiên trong excel nên + 2
        const shipmentFirstRowNo = shipmentFirstIndex + 2;
        const shipmentLastRowNo = shipmentLastIndex + 2;

        let sku = skuList[i] ?? {};
        let {
          domesticShippingCost = "",
          internationalShippingCost = "",
          totalAmount,
        } = sku;
        const totalUnitColLetter = OUTPUT_COL_ALPHABET.TOTAL_UNIT;
        const originalFirstCell = `${totalUnitColLetter}2`;
        const originalLastCell = `${totalUnitColLetter}${skuList.length + 1}`;

        const newFirstCell = `${totalUnitColLetter}${shipmentFirstRowNo}`;
        const newLastCell = `${totalUnitColLetter}${shipmentLastRowNo}`;

        domesticShippingCost = domesticShippingCost
          .toString()
          .replace(originalFirstCell, newFirstCell);
        domesticShippingCost = domesticShippingCost
          .toString()
          .replace(originalLastCell, newLastCell);
        internationalShippingCost = internationalShippingCost
          .toString()
          .replace(originalFirstCell, newFirstCell);
        internationalShippingCost = internationalShippingCost
          .toString()
          .replace(originalLastCell, newLastCell);

        if (i == shipmentFirstIndex) {
          const amountColLetter = OUTPUT_COL_ALPHABET.AMOUNT;
          const firstAmountCell = `${amountColLetter}${shipmentFirstRowNo}`;
          const lastAmountCell = `${amountColLetter}${shipmentLastRowNo}`;
          totalAmount = `SUM(${firstAmountCell}:${lastAmountCell})`;
        }

        skuList[i] = {
          ...sku,
          domesticShippingCost,
          internationalShippingCost,
          totalAmount,
        };
      }
    });
  }

  if (shipmentArr.length == 1) {
    const amountColLetter = OUTPUT_COL_ALPHABET.AMOUNT;
    const firstAmountCell = `${amountColLetter}2`;
    const lastAmountCell = `${amountColLetter}${skuList.length + 1}`;
    const totalAmount = `SUM(${firstAmountCell}:${lastAmountCell})`;
    skuList[0] = {
      ...skuList[0],
      totalAmount,
    };
  }

  return skuList;
};

/// Nếu đợt file gồm nhiều shipment thì phải đổi công thức
const getCogsFileName = (skuList = []) => {
  const shipmentArr = getUniqueValueFromObjArr(skuList, "shipment");
  let fileName = "";
  if (shipmentArr.length >= 1) {
    shipmentArr.forEach((shipment) => {
      fileName += shipment;
      fileName += "-";
    });
  }
  fileName += "cogs.xlsx";

  return fileName;
};

/**
 *
 * @param {Array} skuList
 * @returns
 */
const refactorSkuListFunc = (skuList = []) => {
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
export const addOrder1FileToZip = async (files = [], zip, allElements) => {
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
        await modifyOrder1File(order1File, allElements);
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
  allElements,
  allInputShippingCost,
  inputTsvDataArr
) => {
  const shippingFiles = files.filter(
    (file) => file.fileType == FILE_TYPE.SHIPPING
  );

  for (const shippingFile of shippingFiles) {
    const newShippingBuffer = await modifyShippingFile(
      shippingFile,
      allElements,
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
export const addCogsFileToZip = async (skuList, zip) => {
  skuList = checkMultipleShipmentAndChange(skuList);
  const cogsFileName = getCogsFileName(skuList);
  const refactorSkuList = refactorSkuListFunc(skuList);
  const cogsXlsxBuffer = await cogsJsonToXlsx({ json: refactorSkuList });
  zip.file(cogsFileName, cogsXlsxBuffer);
};

/**
 * Calculates the total price to make each object.
 * @param {Array<ElementPrice>} elementsPrice - The array of element prices.
 */
export const getAllShipmentElements = async (skuList, elementsPrice = []) => {
  let allShipmentElements = skuList
    .map((sku) => {
      const {
        customizePackage = "",
        customPackageCost = "",
        cnyCustomPackageCost = "",
        customPackageOrder = "",
        totalUsdCustomPackageCost = "",
        totalCnyCustomPackageCost = "",
        shipment = "",
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
        return { ...element, shipment, quantity: totalElementQuantity };
      });
      return elements;
    })
    .flat();

  // add up quantity các thành phần
  allShipmentElements = Object.values(
    allShipmentElements.reduce((accumulator, current) => {
      if (accumulator[current.name]) {
        accumulator[current.name].quantity += current.quantity;
      } else {
        accumulator[current.name] = { ...current };
      }
      return accumulator;
    }, {})
  );

  allShipmentElements = allShipmentElements.map((element) => {
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

  const paymentFeeObj = elementsPrice.find((item) => item.isPaymentFee);
  if (paymentFeeObj && paymentFeeObj?.paymentCostDivisor) {
    const { paymentCostDivisor } = paymentFeeObj;

    // tổng usd price của các elements
    const totalElementUsdPrice = allShipmentElements.reduce(
      (acc, element, index) => {
        const rowIndex = index + 2;

        // address của usd price các element khác, tính payment cost dựa trên đó
        const usdPriceAddress = `${SHIPMENT_OUTPUT_COL_ALPHABET.USD_PRICE}${rowIndex}`;
        if (!acc) {
          acc = usdPriceAddress;
        } else {
          acc = `${acc} + ${usdPriceAddress}`;
        }
        return acc;
      },
      ""
    );

    // Tổng quantity của các element trong file shipment này
    const totalElementQuantity = allShipmentElements.reduce((acc, element) => {
      const { quantity = 0 } = element;
      return acc + quantity;
    }, 0);
    const usdPricePaymentFee = `${totalElementUsdPrice} / ${paymentCostDivisor}`;
    const totalUsdPaymentFee = `${usdPricePaymentFee} * ${totalElementQuantity}`;

    const paymentFeeElement = {
      name: paymentFeeObj?.name,
      order: paymentFeeObj?.order,
      cnyPrice: paymentFeeObj?.cnyPrice,
      totalCny: paymentFeeObj?.totalCny,
      usdPrice: usdPricePaymentFee,
      totalUsd: totalUsdPaymentFee,
      quantity: totalElementQuantity,
    };
    allShipmentElements = [...allShipmentElements, paymentFeeElement];
  }

  skuList = removeSkuKey(skuList);
  return allShipmentElements;
};

// định dạng 1 element
// {
//   name: "Silicone Charger Protector (Pink)",
//   quantity: 90,
//   usdPrice: "3.5 / 7.3116",
//   order: "HNV 2303",
//   totalUsd: "3.5 / 7.3116 * 90",
//   totalCny: "3.5 * 90",
//   shipment: "S308",
//   cnyPrice: "3.5",
// }

/**
 *
 * @param {JSZip} zip
 * @returns
 */
export const addShipmentFileToZip = async (
  allElements,
  allInputShippingCost = [],
  allSkuList,
  zip
) => {
  let allElementsByShipment = {};

  // chia theo các element theo shipment to (S304 chẳng hạn)
  Object.keys(allElements).forEach((originalShipment) => {
    const shipment = originalShipment.split(".")[0];
    if (isEmptyValue(allElementsByShipment[shipment])) {
      allElementsByShipment[shipment] = {};
    }
    allElementsByShipment[shipment][originalShipment] =
      allElements[originalShipment];
  });

  for (const shipment of Object.keys(allElementsByShipment)) {
    const shipmentElements = allElementsByShipment[shipment];

    // shipment ở đây là S304 chứ k phải S304.1
    const allShipmentSku = allSkuList.filter(
      (sku) => sku?.shipment == shipment
    );
    const totalSkuShipmentQuantity = allShipmentSku.reduce((acc, sku) => {
      const { quantity = 0 } = sku;
      return acc + quantity;
    }, 0);

    for (const originalShipment of Object.keys(shipmentElements)) {
      const lastElementIndex = allElements[originalShipment].length + 1;
      const subTotalElement = {
        name: KEY_PREFERENCES.SUB_TOTAL,
        quantity: `SUM(${SHIPMENT_OUTPUT_COL_ALPHABET.QUANTITY}2:${SHIPMENT_OUTPUT_COL_ALPHABET.QUANTITY}${lastElementIndex})`,
        // usdPrice: `SUM(${SHIPMENT_OUTPUT_COL_ALPHABET.QUANTITY}2:${SHIPMENT_OUTPUT_COL_ALPHABET.QUANTITY}${lastElementIndex})`,
        // order: "HNV 2303",
        totalUsd: `SUM(${SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_USD}2:${SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_USD}${lastElementIndex})`,
        totalCny: `SUM(${SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_CNY}2:${SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_CNY}${lastElementIndex})`,
        // shipment: "S308",
        // cnyPrice: "3.5",
      };
      allElements[originalShipment].push(subTotalElement);

      const shipmentShippingCosts = allInputShippingCost.filter(
        (shippingObj) => {
          const shippingOriginalShipment = shippingObj?.originalShipment;
          return shippingOriginalShipment == originalShipment;
        }
      );

      shipmentShippingCosts.forEach((item) => {
        const { isDomestic, order = "" } = item;
        const totalShipmentUsd = item?.totalUsd;
        const totalShipmentCny = item?.totalCny;

        let shipmentSkuQuantity = 0;
        allSkuList
          .filter((sku) => sku?.originalShipment == originalShipment)
          .forEach((item) => {
            const { quantity = 0 } = item;
            shipmentSkuQuantity += quantity;
          });

        let totalCny = "";
        let totalUsd = "";
        if (totalSkuShipmentQuantity == shipmentSkuQuantity) {
          totalCny = totalShipmentCny;
          totalUsd = totalShipmentUsd;
        } else {
          totalCny = `${totalShipmentCny} / ${totalSkuShipmentQuantity} * ${shipmentSkuQuantity}`;
          totalUsd = `${totalShipmentUsd} / ${totalSkuShipmentQuantity} * ${shipmentSkuQuantity}`;
        }

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
        allElements[originalShipment].push(shippingElement);
      });
      const refactorAllElements = refactorElements(
        allElements[originalShipment]
      );
      const shipmentResultFileBuffer = await createShipmentExcelBuffer(
        refactorAllElements
      );
      zip.file(`Shipment - ${originalShipment}.xlsx`, shipmentResultFileBuffer);
    }
  }
  return allElements;
};
