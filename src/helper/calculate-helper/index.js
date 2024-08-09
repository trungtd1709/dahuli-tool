import _ from "lodash";
import { inputKeyName } from "../../shared/constant.js";

/**
 * Calculates the total price to make each object.
 * @param {Array} skuList - The array of objects.
 * @param {Array} goodsPrice - The array of element prices.
 * @returns {Array} The array of objects with their total price.
 */
export const calculateTotalPrice = (skuList, goodsPrice) => {
  const exchangeRate = goodsPrice[0].exchangeRate;
  return skuList.map((good) => {
    // đơn vị CNY
    const ppuPrice = good.elements.reduce((acc, element) => {
      const priceObj = goodsPrice.find((p) => p.name === element.name);
      const cnyPrice = priceObj ? priceObj.price : 0;
      const usdPrice = `${cnyPrice} / ${exchangeRate}`;

      let totalGoodsPrice;
      if (parseInt(element.quantity) == 1) {
        totalGoodsPrice = usdPrice;
      } else {
        totalGoodsPrice = `${usdPrice} * ${element.quantity}`;
      }

      const domesticShippingCode =
        priceObj?.[inputKeyName.domesticShippingCost];
      if (domesticShippingCode) {
        const usdDomesticShippingCode = `${domesticShippingCode} / ${exchangeRate}`;
        totalGoodsPrice = `(${usdPrice} + ${usdDomesticShippingCode}) * ${element.quantity}`;
      }

      if (acc == "") {
        return totalGoodsPrice;
      }

      return `${acc} + ${totalGoodsPrice}`;
    }, "");

    return { ...good, ppuPrice };
  });
};

/**
 * Calculates the total price to make each object.
 * @param {Array} skuList - The array of objects.
 * @param {Array} cartonFee - The array of element prices.
 * @returns {Array} The array of objects with their total price.
 */
export const addPackingCost = (skuList, cartonFee) => {
  return skuList.map((item) => {
    const packing = item?.packing;
    const packingObj = cartonFee.find((item) => item.name == packing);
    if (!_.isEmpty(packingObj)) {
      return { ...item, [inputKeyName.packingLabeling]: packingObj.price };
    }
    return item;
  });
};

/**
 * Calculates the total price to make each object.
 * @param {Array} skuList - The array of objects.
 * @param {Array} goodsPrice - The array of element prices.
 * @returns {Array} The array of objects with their total price.
 */
export const addCustomizeCost = (skuList, goodsPrice) => {
  return skuList.map((item) => {
    const customizePackage = item?.customizePackage;
    const customizeObj = goodsPrice.find((item) => item.name == customizePackage);
    if (!_.isEmpty(customizeObj)) {
      const cnyPrice = customizeObj.price;
      const exchangeRate = customizeObj?.exchangeRate;
      const usdPrice = `${cnyPrice} / ${exchangeRate}`;
      return { ...item, [inputKeyName.customPackageCost]: usdPrice };
    }
    return item;
  });
};

export const removeObjKey = (skuList, keyName) => {
  return skuList.map((item) => {
    delete item[keyName];
    return item;
  });
};
