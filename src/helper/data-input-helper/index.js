import _ from "lodash";
import { BadRequestError } from "../../error/bad-request-err.js";
import { ElementPrice, InputShippingCost } from "../../model/index.js";
import {
  CHECK_KEYWORD,
  FILE_TYPE,
  INPUT_KEY_NAME,
  KEY_PREFERENCES,
} from "../../shared/constant.js";
import {
  MISSING_ORDER_1_FILE,
  MISSING_ORDER_1_FILE_ORDER,
  MISSING_SHIPMENT_FILE,
  MISSING_SKU_LIST_FILE,
  MISSING_TSV_FILE,
} from "../../shared/err-const.js";
import {
  Utils,
  compareStrings,
  evalCalculation,
  getMaxIndexKeyValue,
  isEmptyValue,
  mergeArrays,
  removeDivideByNumber,
  removeSpaces,
  removeStringAfter,
  removeWhitespace,
  sortArrayBaseOnKey,
} from "../../shared/utils.js";
import { getDataTsvFile } from "../tsv-helper/index.js";
import { getFileType, xlsxToJSON } from "../xlsx-handler/index.js";

/**
 *
 * @param {Array} rawJson
 * @returns {Array}
 */
export const transformSkuListInput = (rawJson) => {
  return rawJson.map((item) => {
    return transformSkuItem(item);
  });
};

/**
 *
 * @param {*} obj
 * @returns
 */
const transformSkuItem = (obj) => {
  const { SKU, ...rest } = obj; // Extract SKU and the rest of the properties

  let elements = Object.keys(rest).reduce((acc, key) => {
    // Only process keys that are "__EMPTY" or "Thành phần PPU"
    if (
      key.startsWith(INPUT_KEY_NAME.EMPTY) ||
      key === INPUT_KEY_NAME.PPU_ELEMENTS
    ) {
      const value = rest[key];
      const match = value.match(/^(\d+)\s*(.*)$/); // Match leading digits and the rest of the string
      const quantity = match ? parseInt(match[1], 10) : 1; // Extract quantity or default to 1
      const name = match ? match[2].trim() : value; // Extract name or use the whole value

      acc.push({ name, quantity });
    }
    return acc;
  }, []);

  const product = { SKU, elements };

  if (obj?.[INPUT_KEY_NAME.PACKING_LABELING]) {
    product.packing = obj[INPUT_KEY_NAME.PACKING_LABELING];
  }
  if (obj?.[INPUT_KEY_NAME.CUSTOM_PACKAGE]) {
    product.customizePackage = obj[INPUT_KEY_NAME.CUSTOM_PACKAGE];
  }

  return product;
};

/**
 *
 * @param {*} obj
 * @returns
 */
const transformToElementPrice = (obj, labelingCostArr = []) => {
  const labelingCostObj = labelingCostArr[0];
  const {
    productName: name,
    quantity,
    [INPUT_KEY_NAME.TOTAL_CNY]: totalCny,
    [INPUT_KEY_NAME.TOTAL_USD]: totalUsd,
    [INPUT_KEY_NAME.DOMESTIC_SHIPPING_COST]: domesticShippingCost,
    [INPUT_KEY_NAME.USD]: fileUsdPrice,
    [INPUT_KEY_NAME.CNY]: fileCnyPrice,

    packingLabelingCost,
    exchangeRate,
    fileName,
    order = "",
    paymentCostDivisor,
    image,
  } = obj;

  const inStock = getMaxIndexKeyValue(obj, INPUT_KEY_NAME.IN_STOCK);
  const roundTotalCny = Utils.roundNumber(totalCny);
  const roundTotalUsd = Utils.roundNumber(totalUsd);

  const cnyPrice = fileCnyPrice
    ? fileCnyPrice
    : evalCalculation(`${roundTotalCny} / ${quantity}`);

  const usdPrice = fileUsdPrice
    ? fileUsdPrice
    : evalCalculation(`${roundTotalUsd} / ${quantity}`);

  const labelingCostUsd = labelingCostObj?.getUsdFormula();
  const labelingCostCny = labelingCostObj?.getCnyFormula();

  const elementPrice = ElementPrice.fromJson({
    name: name.trim(),
    exchangeRate,
    fileName,
    cnyPrice,
    usdPrice,
    domesticShippingCost,
    packingLabelingCost,
    order: order.trim(),
    quantity,
    leftQuantity: inStock,
    paymentCostDivisor,
    image,
  });

  return elementPrice;
};

/**
 *
 * @param {*} obj
 * @returns
 */
const transformOrderItem = (obj) => {
  const {
    productName: name,
    quantity,
    [INPUT_KEY_NAME.TOTAL_CNY]: totalCny,
    [INPUT_KEY_NAME.DOMESTIC_SHIPPING_COST]: domesticShippingCost,
    packingLabelingCost,
    exchangeRate,
    paymentCostDivisor,
    order = "",
  } = obj;

  const itemPriceCny = evalCalculation(`${totalCny} / ${quantity}`);

  const newObject = {
    packingLabelingCost,
    name,
    price: itemPriceCny,
    quantity,
    exchangeRate,
    ...(domesticShippingCost && {
      [INPUT_KEY_NAME.DOMESTIC_SHIPPING_COST]: domesticShippingCost,
    }),
    order,
  };

  return newObject;
};

export const transformPrinttingFeeInput = (rawJson = []) => {
  rawJson.pop();
  const printtingFeeInput = rawJson.map((item) => {
    return transformOrderItem(item);
  });
  return printtingFeeInput.filter((item) => item.price);
};

export const transformOrder1List = (rawJson = [], shipmentId) => {
  rawJson = rawJson.filter(
    (item) => item?.productName?.toLowerCase() != CHECK_KEYWORD.TOTAL
  );

  let domesticShippingCostArr = [];
  let internationalShippingCostArr = [];
  let packingLabelingCostArr = [];
  let inputPrinttingFeeArr = [];

  // add phí ship nội địa vào obj nếu có
  for (let [index, item] of rawJson.entries()) {
    const productName = item?.productName?.toLowerCase() ?? "";
    const totalCny = item?.[INPUT_KEY_NAME.TOTAL_CNY]?.toString();
    const { quantity, fileName } = item;
    const exchangeRate = item[INPUT_KEY_NAME.EXCHANGE_RATE];

    // START Lọc labeling cost
    if (
      productName.includes(KEY_PREFERENCES.PACKING) &&
      productName.includes(KEY_PREFERENCES.LABELING)
    ) {
      const packingLabelingCostYuan = evalCalculation(
        `${totalCny} / ${quantity}`
      );

      const packingLabelingCostObj = ElementPrice.fromJson({
        name: item?.productName?.trim(),
        fileName,
        cnyPrice: packingLabelingCostYuan,
        quantity,
        exchangeRate,
      });
      packingLabelingCostArr.push(packingLabelingCostObj);
    }
    // END Lọc labeling cost

    // START phí ship
    if (
      productName.includes(KEY_PREFERENCES.DOMESTIC) &&
      productName.includes(shipmentId.toLowerCase())
    ) {
      const domesticCostUsd = `${totalCny} / ${exchangeRate}`;
      const domesticShippingCostObj = {
        shipmentId: shipmentId,
        totalUsd: domesticCostUsd,
        isDomestic: true,
        paymentCostDivisor: null,
      };
      domesticShippingCostArr.push(
        InputShippingCost.fromJson(domesticShippingCostObj)
      );
    }

    if (
      productName.includes(KEY_PREFERENCES.INTERNATIONAL) &&
      productName.includes(shipmentId.toLowerCase())
    ) {
      const internationalCostUsd = `${totalCny} / ${exchangeRate}`;
      const internationalShippingCostObj = {
        shipmentId: shipmentId,
        totalUsd: internationalCostUsd,
        isDomestic: false,
        paymentCostDivisor: null,
      };
      internationalShippingCostArr.push(
        InputShippingCost.fromJson(internationalShippingCostObj)
      );
    }
    // END phí ship
  }

  // START remove obj shipping cost
  rawJson = rawJson.filter((obj) => {
    return (
      !Utils.includes(obj?.productName, "domestic") &&
      !(
        Utils.includes(obj.productName, "labeling") &&
        Utils.includes(obj.productName, "packing")
      )
    );
  });
  // END REMOVE

  const elementsPriceArr = rawJson.map((item) => {
    return transformToElementPrice(item,packingLabelingCostArr);
  });
  return {
    elementsPriceArr,
    domesticShippingCostArr,
    packingLabelingCostArr,
    internationalShippingCostArr,
    inputPrinttingFeeArr,
  };
};

export const transformOrderList1Input = (rawJson = [], shipmentId) => {
  // rawJson.pop();
  // remove phần tử Total
  rawJson = rawJson.filter(
    (item) => item?.productName?.toLowerCase() != CHECK_KEYWORD.TOTAL
  );

  let domesticShippingCostArr = [];
  let internationalShippingCostArr = [];
  let packingLabelingCostArr = [];
  let inputPrinttingFeeArr = [];

  // add phí ship nội địa vào obj nếu có
  for (let [index, item] of rawJson.entries()) {
    const productName = item?.productName?.toLowerCase() ?? "";
    const totalCny = item?.[INPUT_KEY_NAME.TOTAL_CNY]?.toString();
    const quantity = item?.quantity;
    const exchangeRate = item[INPUT_KEY_NAME.EXCHANGE_RATE];

    if (
      productName.includes(KEY_PREFERENCES.PACKING) &&
      productName.includes(KEY_PREFERENCES.LABELING)
    ) {
      const packingLabelingCostYuan = evalCalculation(
        `${totalCny} / ${quantity}`
      );
      packingLabelingCostArr.push({
        exchangeRate,
        name: item?.productName,
        price: packingLabelingCostYuan,
        quantity,
      });
    }

    const prevProduct = rawJson[index - 1] ?? {};
    const prevProductName = prevProduct?.productName?.toLowerCase();
    const prevProductQuantity = prevProduct?.quantity;

    // phí tính cột riêng
    if (
      productName.includes(KEY_PREFERENCES.DOMESTIC) &&
      productName.includes(shipmentId.toLowerCase())
    ) {
      const domesticCostUsd = `${totalCny} / ${exchangeRate}`;
      const domesticShippingCostObj = {
        shipmentId: shipmentId,
        totalUsd: domesticCostUsd,
        isDomestic: true,
        paymentCostDivisor: null,
      };
      domesticShippingCostArr.push(
        InputShippingCost.fromJson(domesticShippingCostObj)
      );
    }

    if (
      productName.includes(KEY_PREFERENCES.INTERNATIONAL) &&
      productName.includes(shipmentId.toLowerCase())
    ) {
      const internationalCostUsd = `${totalCny} / ${exchangeRate}`;
      const internationalShippingCostObj = {
        shipmentId: shipmentId,
        totalUsd: internationalCostUsd,
        isDomestic: false,
        paymentCostDivisor: null,
      };
      internationalShippingCostArr.push(
        InputShippingCost.fromJson(internationalShippingCostObj)
      );
    }

    // phí tính PPU
    // obj phí ship nội địa của 1 sản phẩm
    if (!item?.quantity && productName?.includes(prevProductName)) {
      const prevQuantity = prevProductQuantity.toString();
      const itemShippingFee = evalCalculation(`${totalCny} / ${prevQuantity}`);
      rawJson[index - 1][INPUT_KEY_NAME.DOMESTIC_SHIPPING_COST] =
        itemShippingFee;
    }
  }

  // remove obj shipping cost
  rawJson = rawJson.filter((obj) => {
    return (
      !obj.productName?.toLowerCase()?.includes("domestic") &&
      !(
        obj.productName?.toLowerCase()?.includes("labeling") &&
        obj.productName?.toLowerCase()?.includes("packing")
      )
    );
  });

  const elementsPriceArr = rawJson.map((item) => {
    return transformOrderItem(item);
  });
  return {
    elementsPriceArr,
    domesticShippingCostArr,
    packingLabelingCostArr,
    internationalShippingCostArr,
    inputPrinttingFeeArr,
  };
};

/**
 *
 * @param {*} obj
 * @returns
 */
const transformCartonFee = (obj) => {
  const cnyItemPrice = evalCalculation(
    `${obj[INPUT_KEY_NAME.TOTAL_CNY]} / ${obj?.quantity}`
  );

  const itemPrice = `${cnyItemPrice} / ${obj[INPUT_KEY_NAME.EXCHANGE_RATE]}`;
  const newObj = {
    name: obj?.productName,
    price: itemPrice,
  };
  return newObj;
};

/**
 *
 * @param {*} rawJson
 * @returns
 */
export const transformCartonFeeInput = (rawJson = []) => {
  const cartonFeeInput = rawJson.map((item) => {
    return transformCartonFee(item);
  });
  return cartonFeeInput.filter((item) => item.price);
};

/**
 *
 * @param {*} shippingArr
 * @param {*} shipmentId
 * @param {*} shipment
 * @param {*} totalShipmentQuantity
 * @returns
 */
export const transformShippingCostInput = (
  shippingArr = [],
  shipmentId,
  shipment,
  originalShipment,
  totalShipmentQuantity,
  shipmentQuantity
) => {
  shippingArr = shippingArr.filter((item) => {
    return item.productName.includes(shipment);
  });

  shippingArr = shippingArr.filter((item) => {
    return !item.productName
      .toLowerCase()
      .includes(KEY_PREFERENCES.PAYMENT_COST);
  });

  if (shipment != originalShipment) {
    const isOriginalShipmentExist = shippingArr.some((item) => item.productName.includes(originalShipment));
    if (isOriginalShipmentExist) {
      shippingArr = shippingArr.filter((item) => {
        return item.productName.includes(originalShipment);
      });
    }
  }

  return shippingArr.map((item) => {
    return transformShippingCostItem(
      item,
      shipmentId,
      shipment,
      originalShipment,
      totalShipmentQuantity,
      shipmentQuantity
    );
  });
};

/**
 *
 * @param {*} obj
 * @param {*} shipmentId
 * @param {*} shipment
 * @param {*} totalShipmentQuantity
 * @returns
 */
const transformShippingCostItem = (
  obj,
  shipmentId,
  shipment,
  originalShipment,
  totalShipmentQuantity,
  shipmentQuantity
) => {
  const {
    productName: name,
    weight,
    priceShippingFormulaUsd,
    priceShippingFormulaCny,
    paymentCostDivisor,
    exchangeRate,
    order = "",
  } = obj;
  const rawTotalUsd = obj?.[INPUT_KEY_NAME.TOTAL_USD];
  const rawTotalCny = obj?.[INPUT_KEY_NAME.TOTAL_CNY];

  let totalUsd =
    rawTotalCny && exchangeRate
      ? `${rawTotalCny} / ${exchangeRate}`
      : rawTotalUsd ?? "";
  let totalCny = rawTotalCny ?? "";

  if (priceShippingFormulaUsd && weight) {
    if (removeWhitespace(priceShippingFormulaUsd).includes(`/${weight}`)) {
      totalUsd = removeDivideByNumber(priceShippingFormulaUsd, weight);
    } else {
      totalUsd = `(${priceShippingFormulaUsd} * ${weight})`;
    }
  }
  if (priceShippingFormulaCny && weight) {
    totalCny = `(${priceShippingFormulaCny} * ${weight})`;
  }
  const lowerCaseShipName = name.toLowerCase();
  // ko chứa chữ domestic mặc định là international
  const isDomestic = lowerCaseShipName.includes(KEY_PREFERENCES.DOMESTIC);

  // if(!name?.includes(originalShipment)){
  //   originalShipment = shipment;
  // }

  return InputShippingCost.fromJson({
    name,
    shipmentId,
    shipment,
    originalShipment,
    totalUsd,
    totalCny,
    weight,
    isDomestic,
    paymentCostDivisor,
    totalShipmentQuantity,
    order,
    shipmentQuantity,
  });
};

/**
 *
 * @param {Array} rawJson
 * @returns {Array}
 */
export const transformShipmentListInput = (rawJson) => {
  return rawJson.map((item) => {
    return transformShipmentItem(item);
  });
};

/**
 *
 */
const transformShipmentItem = (obj) => {
  let {
    [INPUT_KEY_NAME.SHIPMENT]: originalShipment,
    [INPUT_KEY_NAME.SHIPMENT_ID]: shipmentId,
  } = obj;

  let shipment = originalShipment;

  if (!isEmptyValue(originalShipment)) {
    shipment = removeStringAfter(shipment, "-");
    shipment = removeStringAfter(shipment, ".");
    shipment = removeSpaces(shipment);
  }

  return {
    originalShipment: originalShipment,
    shipment: shipment,
    shipmentId,
  };
};

/**
 *
 */
export const getRawInputShippingCost = async (files = []) => {
  let rawInputShippingCost = [];
  const shippingListFiles = files.filter(
    (file) => file.fileType == FILE_TYPE.SHIPPING
  );

  if (!isEmptyValue(shippingListFiles)) {
    for (const shippingFile of shippingListFiles) {
      const { order } = shippingFile;
      const dataRawFile = await xlsxToJSON({
        file: shippingFile,
        paymentCostKeyName: [
          INPUT_KEY_NAME.TOTAL_USD,
          INPUT_KEY_NAME.TOTAL_CNY,
        ],
        exchangeRateKeyName: INPUT_KEY_NAME.TOTAL_USD,
        isShippingFile: true,
      });
      const rawJson = dataRawFile.map((item) => {
        return { ...item, order };
      });
      rawInputShippingCost = [...rawInputShippingCost, ...rawJson];
    }
  }
  return rawInputShippingCost;
};

/**
 * @param {Array.<Express.Multer.File>} files
 */
export const getRawOrder1Data = async (files = []) => {
  let rawJsonOrder1 = [];
  const order1Files = files.filter(
    (file) => file.fileType == FILE_TYPE.ORDER_1
  );
  if (isEmptyValue(order1Files)) {
    throw new BadRequestError(MISSING_ORDER_1_FILE);
  }

  for (const order1File of order1Files) {
    const { order, originalname } = order1File;

    // thứ tự file
    const fileOrder = extractNumberFromFilename(originalname);
    if (!fileOrder && order1Files.length > 1) {
      throw new BadRequestError(
        `${MISSING_ORDER_1_FILE_ORDER}: ${originalname}`
      );
    }
    const fileRawData = await xlsxToJSON({
      file: order1File,
      paymentCostKeyName: [INPUT_KEY_NAME.TOTAL_USD, INPUT_KEY_NAME.TOTAL_CNY],
      exchangeRateKeyName: INPUT_KEY_NAME.TOTAL_USD,
    });

    const rawOrder1Data = fileRawData.map((item) => {
      return { ...item, order, fileName: originalname };
    });
    rawJsonOrder1 = [...rawJsonOrder1, ...rawOrder1Data];
  }
  rawJsonOrder1 = rawJsonOrder1.filter((item) => {
    return !isEmptyValue(item?.productName);
  });
  return rawJsonOrder1;
};

/**
 * @param {Array.<Express.Multer.File>} files
 */
export const getShipmentData = async (files = []) => {
  let shipmentData = [];
  const shipmentFile = files.find(
    (file) => file.fileType == FILE_TYPE.SHIPMENT
  );

  if (!isEmptyValue(shipmentFile)) {
    shipmentData = transformShipmentListInput(
      await xlsxToJSON({ file: shipmentFile })
    );
  }

  if (isEmptyValue(shipmentData)) {
    throw new BadRequestError(MISSING_SHIPMENT_FILE);
  }

  return shipmentData;
};

/**
 * @param {Array.<Express.Multer.File>} files
 */
export const getTsvFilesArr = (files = []) => {
  const tsvFilesArr = files.filter((file) => file.fileType == FILE_TYPE.TSV);
  if (isEmptyValue(tsvFilesArr)) {
    throw new BadRequestError(MISSING_TSV_FILE);
  }
  return tsvFilesArr;
};

/**
 *
 * @param {Array.<Express.Multer.File>} files
 * @returns
 */
export const getTotalSkuList = async (files = []) => {
  let totalSkuList = [];
  const skuListFiles = files.filter(
    (file) => file.fileType == FILE_TYPE.SKU_LIST
  );
  if (isEmptyValue(skuListFiles)) {
    throw new BadRequestError(MISSING_SKU_LIST_FILE);
  }

  for (const skuListFile of skuListFiles) {
    const rawSkuListData = await xlsxToJSON({ file: skuListFile });
    totalSkuList = [...totalSkuList, ...rawSkuListData];
  }

  totalSkuList = transformSkuListInput(totalSkuList);

  return totalSkuList;
};

/**
 *
 * @param {Array.<Express.Multer.File>} files
 * @returns
 */
export const addFileTypeAndOrder = (files) => {
  files = files.map((file) => {
    const fileType = getFileType(file);
    const order = file.originalname.split("-")[0];
    return { ...file, fileType, order };
  });
  return files;
};

/**
 *
 * @param {Array.<Express.Multer.File>} tsvFilesArr
 */
export const mergeTsvData = async (
  tsvFilesArr = [],
  totalSkuList,
  shipmentData = []
) => {
  let totalShipmentQuantity = 0;
  let totalSkuType = 0;
  let inputTsvDataArr = [];

  for (const tsvFile of tsvFilesArr) {
    let { shipmentQuantity, inputTsvData } = await getDataTsvFile({
      file: tsvFile,
    });
    totalShipmentQuantity += shipmentQuantity;

    if (!isEmptyValue(shipmentData)) {
      let shipmentId = inputTsvData[0].shipmentId;
      const shipmentObj = shipmentData.find(
        (item) => item?.shipmentId == shipmentId
      );
      const { shipment, originalShipment } = shipmentObj;
      inputTsvData = inputTsvData.map((item) => {
        return { ...item, shipment, originalShipment, shipmentQuantity };
      });
    }
    inputTsvDataArr.push(inputTsvData);

    const thisTsvSkuList = mergeArrays(
      inputTsvData,
      totalSkuList,
      INPUT_KEY_NAME.SKU
    ).filter((item) => !_.isEmpty(item?.elements));
    totalSkuType += thisTsvSkuList.length;
  }

  inputTsvDataArr = inputTsvDataArr.sort((a, b) => {
    if (a[0]?.originalShipment > b[0]?.originalShipment) {
      return 1;
    }
    if (a[0]?.originalShipment < b[0]?.originalShipment) {
      return -1;
    }
    return 0;
  });
  inputTsvDataArr = sortArrayBaseOnKey(inputTsvDataArr, "originalShipment");

  return {
    totalShipmentQuantity,
    totalSkuType,
    inputTsvDataArr,
  };
};

export function extractNumberFromFilename(fileName) {
  const match = fileName.match(/\((\d+)\)\.xlsx$/);
  if (match) {
    return parseInt(match[1]); // Return the extracted number
  } else {
    return null; // Return null if no number is found
  }
}
