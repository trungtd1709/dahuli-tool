import { inputKeyName, keyPreferences } from "../../shared/constant.js";
import { evalCalculation } from "../../shared/utils.js";

/**
 *
 * @param {Array} rawJson
 * @returns {Array}
 */
export const transformProductListInput = (rawJson) => {
  return rawJson.map((item) => {
    return transformProductItem(item);
  });
};

const transformProductItem = (obj) => {
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
    [inputKeyName.quantity]: quantity,
    [inputKeyName.totalCny]: totalCny,
    [inputKeyName.domesticShippingCost]: domesticShippingCost,
    exchangeRate,
  } = obj;

  const itemPriceCny = evalCalculation(`${totalCny} / ${quantity}`);

  const newObject = {
    name,
    price: itemPriceCny,
    quantity,
    exchangeRate,
    ...(domesticShippingCost && {
      [inputKeyName.domesticShippingCost]: domesticShippingCost,
    }),
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
  rawJson.pop();
  // remove phần tử Total

  let domesticShippingCostObj = {};
  let internationalShippingCostObj = {};
  let packingLabelingCost = null;

  // add phí ship nội địa vào obj nếu có
  for (let [index, item] of rawJson.entries()) {
    const productName = item?.productName?.toLowerCase() ?? "";
    const totalCny = item?.[inputKeyName.totalCny].toString();
    const quantity = item[inputKeyName.quantity];
    const exchangeRate = item[inputKeyName.exchangeRate];

    if (
      productName.includes(keyPreferences.packing) &&
      productName.includes(keyPreferences.labeling)
    ) {
      const packingLabelingCostYuan = evalCalculation(
        `${totalCny} / ${quantity}`
      );
      packingLabelingCost = `${packingLabelingCostYuan} / ${exchangeRate}`;
    }

    const prevProduct = rawJson[index - 1] ?? {};
    const prevProductName = prevProduct?.productName?.toLowerCase();
    const prevProductQuantity = prevProduct?.[inputKeyName.quantity];

    if (
      productName.includes(keyPreferences.domestic) &&
      productName.includes(shipmentId.toLowerCase())
    ) {
      const domesticCostUsd = `${totalCny} / ${exchangeRate}`;
      domesticShippingCostObj = {
        shipmentId: shipmentId,
        totalUsd: domesticCostUsd,
        isDomestic: true,
        paymentCostDivisor: null,
      };
    }

    if (
      productName.includes(keyPreferences.international) &&
      productName.includes(shipmentId.toLowerCase())
    ) {
      const internationalCostUsd = `${totalCny} / ${exchangeRate}`;
      internationalShippingCostObj = {
        shipmentId: shipmentId,
        totalUsd: internationalCostUsd,
        isDomestic: false,
        paymentCostDivisor: null,
      };
    }

    // obj phí ship nội địa của 1 sản phẩm
    if (
      !item?.[inputKeyName.quantity] &&
      productName?.includes(prevProductName)
    ) {
      const prevQuantity = prevProductQuantity.toString();
      const itemShippingFee = evalCalculation(`${totalCny} / ${prevQuantity}`);
      rawJson[index - 1][inputKeyName.domesticShippingCost] = itemShippingFee;
    }
  }

  // remove obj shipping cost
  // rawJson = rawJson.filter((item) => item?.[inputKeyName.price]);
  rawJson = rawJson.filter((obj) => {
    return (
      !obj.productName.toLowerCase().includes("domestic") &&
      !(
        obj.productName.toLowerCase().includes("labeling") &&
        obj.productName.toLowerCase().includes("packing")
      )
    );
  });

  const elementsPrice = rawJson.map((item) => {
    return transformOrderItem(item);
  });
  return {
    elementsPrice,
    domesticShippingCostObj,
    packingLabelingCost,
    internationalShippingCostObj,
  };
  // return order1Input.filter((item) => item.price);
};

const transformCartonFee = (obj) => {
  const cnyItemPrice = evalCalculation(
    `${obj[inputKeyName.totalCny]} / ${obj[inputKeyName.quantity]}`
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

export const transformShippingCostInput = (shippingArr = [], shipmentId) => {
  shippingArr = shippingArr.filter((item) => {
    return item.productName.includes(shipmentId);
  });

  shippingArr = shippingArr.filter((item) => {
    return !item.productName.toLowerCase().includes(keyPreferences.paymentCost);
  });

  return shippingArr.map((item) => {
    return transformShippingCostItem(item, shipmentId);
  });
};

const transformShippingCostItem = (obj, shipmentId) => {
  const {
    productName: name,
    weight,
    shippingFormula,
    paymentCostDivisor,
  } = obj;
  const totalUsd = `(${shippingFormula} * ${weight})`;
  const lowerCaseShipName = name.toLowerCase();
  // ko chứa chữ domestic mặc định là international
  const isDomestic = lowerCaseShipName.includes(keyPreferences.domestic);

  return {
    shipmentId,
    totalUsd,
    isDomestic,
    paymentCostDivisor,
  };
};
