import _ from "lodash";
import { BadRequestError } from "../../error/bad-request-err.js";
import { ElementPrice, InputShippingCost } from "../../model/index.js";
import {
  CHECK_KEYWORD,
  FILE_TYPE,
  inputKeyName,
  KEY_PREFERENCES,
} from "../../shared/constant.js";
import {
  MISSING_ORDER_1_FILE,
  MISSING_SKU_LIST_FILE,
  MISSING_TSV_FILE,
} from "../../shared/err-const.js";
import {
  evalCalculation,
  isEmptyValue,
  mergeArrays,
  removeSpaces,
  removeStringAfter,
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
    if (key.startsWith(inputKeyName.empty) || key === inputKeyName.ppuElement) {
      const value = rest[key];
      const match = value.match(/^(\d+)\s*(.*)$/); // Match leading digits and the rest of the string
      const quantity = match ? parseInt(match[1], 10) : 1; // Extract quantity or default to 1
      const name = match ? match[2].trim() : value; // Extract name or use the whole value

      acc.push({ name, quantity });
    }
    return acc;
  }, []);

  const product = { SKU, elements };

  if (obj?.[inputKeyName.packingLabeling]) {
    product.packing = obj[inputKeyName.packingLabeling];
  }
  if (obj?.[inputKeyName.customizePackage]) {
    product.customizePackage = obj[inputKeyName.customizePackage];
  }

  return product;
};

/**
 *
 * @param {*} obj
 * @returns
 */
const transformToElementPrice = (obj) => {
  const {
    productName: name,
    quantity,
    [inputKeyName.totalCny]: totalCny,
    [inputKeyName.domesticShippingCost]: domesticShippingCost,
    packingLabelingCost,
    exchangeRate,
    fileName,
    order = "",
  } = obj;

  const cnyPrice = evalCalculation(`${totalCny} / ${quantity}`);

  const elementPrice = ElementPrice.fromJson({
    name,
    exchangeRate,
    fileName,
    cnyPrice,
    domesticShippingCost,
    packingLabelingCost,
    order,
    quantity,
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
    // [inputKeyName.price]: cnyPrice, // đơn vị là CNY
    quantity,
    [inputKeyName.totalCny]: totalCny,
    [inputKeyName.domesticShippingCost]: domesticShippingCost,
    packingLabelingCost,
    exchangeRate,
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
      [inputKeyName.domesticShippingCost]: domesticShippingCost,
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

export const testTransformOrderList1Input = (rawJson = [], shipmentId) => {
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
    const totalCny = item?.[inputKeyName.totalCny]?.toString();
    const { quantity, fileName } = item;
    const exchangeRate = item[inputKeyName.exchangeRate];

    if (
      productName.includes(KEY_PREFERENCES.packing) &&
      productName.includes(KEY_PREFERENCES.labeling)
    ) {
      const packingLabelingCostYuan = evalCalculation(
        `${totalCny} / ${quantity}`
      );

      const packingLabelingCostObj = ElementPrice.fromJson({
        name: item?.productName,
        fileName,
        cnyPrice: packingLabelingCostYuan,
        quantity,
        exchangeRate,
      });
      packingLabelingCostArr.push(packingLabelingCostObj);
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
      rawJson[index - 1][inputKeyName.domesticShippingCost] = itemShippingFee;
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
    return transformToElementPrice(item);
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
    const totalCny = item?.[inputKeyName.totalCny]?.toString();
    const quantity = item?.quantity;
    const exchangeRate = item[inputKeyName.exchangeRate];

    if (
      productName.includes(KEY_PREFERENCES.packing) &&
      productName.includes(KEY_PREFERENCES.labeling)
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
      rawJson[index - 1][inputKeyName.domesticShippingCost] = itemShippingFee;
    }
  }

  // remove obj shipping cost
  // rawJson = rawJson.filter((item) => item?.[inputKeyName.price]);
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
    `${obj[inputKeyName.totalCny]} / ${obj?.quantity}`
  );

  const itemPrice = `${cnyItemPrice} / ${obj[inputKeyName.exchangeRate]}`;
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
  totalShipmentQuantity
) => {
  shippingArr = shippingArr.filter((item) => {
    return (
      item.productName.includes(shipmentId) ||
      item.productName.includes(shipment)
    );
  });

  shippingArr = shippingArr.filter((item) => {
    return !item.productName
      .toLowerCase()
      .includes(KEY_PREFERENCES.paymentCost);
  });

  return shippingArr.map((item) => {
    return transformShippingCostItem(
      item,
      shipmentId,
      shipment,
      totalShipmentQuantity
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
  totalShipmentQuantity
) => {
  const {
    productName: name,
    weight,
    priceShippingFormulaUsd,
    priceShippingFormulaYuan,
    paymentCostDivisor,
    exchangeRate,
    order = "",
  } = obj;
  const rawTotalUsd = obj?.[inputKeyName.totalUsd];
  const rawTotalCny = obj?.[inputKeyName.totalCny];

  let totalUsd =
    rawTotalCny && exchangeRate
      ? `${rawTotalCny} / ${exchangeRate}`
      : rawTotalUsd ?? "";
  let totalCny = rawTotalCny ?? "";

  if (priceShippingFormulaUsd && weight) {
    totalUsd = `(${priceShippingFormulaUsd} * ${weight})`;
  }
  if (priceShippingFormulaYuan && weight) {
    totalCny = `(${priceShippingFormulaYuan} * ${weight})`;
  }
  const lowerCaseShipName = name.toLowerCase();
  // ko chứa chữ domestic mặc định là international
  const isDomestic = lowerCaseShipName.includes(KEY_PREFERENCES.DOMESTIC);

  return InputShippingCost.fromJson({
    name,
    shipmentId,
    shipment,
    totalUsd,
    totalCny,
    weight,
    isDomestic,
    paymentCostDivisor,
    totalShipmentQuantity,
    order,
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
    [inputKeyName.shipment]: originalShipment,
    [inputKeyName.shipmentId]: shipmentId,
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
export const getRawInputShippingCost = (files = []) => {
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

/**
 * @param {Array.<Express.Multer.File>} files
 */
export const getRawOrder1Data = (files = []) => {
  let rawJsonOrder1 = [];
  const order1Files = files.filter(
    (file) => file.fileType == FILE_TYPE.ORDER_1
  );
  if (isEmptyValue(order1Files)) {
    throw new BadRequestError(MISSING_ORDER_1_FILE);
  }

  for (const order1File of order1Files) {
    const { order, originalname } = order1File;
    const rawOrder1Data = xlsxToJSON({
      file: order1File,
      exchangeRateKeyName: inputKeyName.totalUsd,
    }).map((item) => {
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
export const getShipmentData = (files = []) => {
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
export const getTotalSkuList = (files = []) => {
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
export const mergeTsvData = async (tsvFilesArr = [], totalSkuList) => {
  let totalShipmentQuantity = 0;
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

  return {
    totalShipmentQuantity,
    totalSkuType,
    inputTsvDataArr,
  };
};

export function extractNumberFromFilename(fileName) {
  const match = fileName.match(/\((\d+)\)\.xlsx$/);
  if (match) {
    return match[1]; // Return the extracted number
  } else {
    return null; // Return null if no number is found
  }
}
