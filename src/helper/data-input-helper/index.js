import { inputKeyName } from "../../shared/constant.js";
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

const transformOrderListItem = (obj) => {
  const {
    [inputKeyName.productName]: name,
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

export const transformOrderList2Input = (rawJson = []) => {
  rawJson.pop();
  const printtingFeeInput = rawJson.map((item) => {
    return transformOrderListItem(item);
  });
  return printtingFeeInput.filter((item) => item.price);
};

export const transformOrderList1Input = (rawJson = []) => {
  rawJson.pop();
  // remove phần tử Total

  // add phí ship nội địa vào obj nếu có
  for (let [index, item] of rawJson.entries()) {
    if (!item?.[inputKeyName.quantity]) {
      const quantity = rawJson[index - 1]?.[inputKeyName.quantity].toString();
      const totalShippingFee = item?.[inputKeyName.totalCny].toString();
      const itemShippingFee = evalCalculation(
        `${totalShippingFee} / ${quantity}`
      );
      rawJson[index - 1][inputKeyName.domesticShippingCost] = itemShippingFee;
    }
  }

  // remove obj shipping cost
  rawJson = rawJson.filter((item) => item?.[inputKeyName.price]);

  const order1Input = rawJson.map((item) => {
    return transformOrderListItem(item);
  });
  return order1Input;
  // return order1Input.filter((item) => item.price);
};

const transformCartonFee = (obj) => {
  const cnyItemPrice = evalCalculation(
    `${obj[inputKeyName.totalCny]} / ${obj[inputKeyName.quantity]}`
  );

  const itemPrice = `${cnyItemPrice} / ${obj[inputKeyName.exchangeRate]}`;
  const newObj = {
    name: obj[inputKeyName.productName],
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
