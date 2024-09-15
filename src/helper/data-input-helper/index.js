import {
  CHECK_KEYWORD,
  inputKeyName,
  KEY_PREFERENCES,
} from "../../shared/constant.js";
import {
  evalCalculation,
  isEmptyValue,
  removeSpaces,
  removeStringAfter,
} from "../../shared/utils.js";

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
      // const packingLabelingCost = `${packingLabelingCostYuan} / ${exchangeRate}`;
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
      domesticShippingCostArr.push(domesticShippingCostObj);
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
      internationalShippingCostArr.push(internationalShippingCostObj);
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
  // return order1Input.filter((item) => item.price);
};

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

export const transformCartonFeeInput = (rawJson = []) => {
  const cartonFeeInput = rawJson.map((item) => {
    return transformCartonFee(item);
  });
  return cartonFeeInput.filter((item) => item.price);
};

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

const transformShippingCostItem = (
  obj,
  shipmentId,
  shipment,
  totalShipmentQuantity,
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
  let totalUsd = "";
  let totalCny = "";

  if (priceShippingFormulaUsd && weight) {
    totalUsd = `(${priceShippingFormulaUsd} * ${weight})`;
  }
  if (priceShippingFormulaYuan && weight) {
    totalCny = `(${priceShippingFormulaYuan} * ${weight})`;
  }
  const lowerCaseShipName = name.toLowerCase();
  // ko chứa chữ domestic mặc định là international
  const isDomestic = lowerCaseShipName.includes(KEY_PREFERENCES.DOMESTIC);

  return {
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
  };
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
