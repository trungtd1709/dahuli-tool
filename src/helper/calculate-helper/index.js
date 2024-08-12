import _ from "lodash";
import { inputKeyName, outputColAlphabet } from "../../shared/constant.js";
import { evalCalculation } from "../../shared/utils.js";

/**
 * Calculates the total price to make each object.
 * @param {Array} skuList - The array of objects.
 * @param {Array} goodsPrice - The array of element prices.
 * @returns {Array} The array of objects with their total price.
 */
export const calculatePpuPrice = (skuList, goodsPrice) => {
  const exchangeRate = goodsPrice[0].exchangeRate;
  return skuList.map((good) => {
    // đơn vị CNY
    const ppuPrice = good.elements.reduce((acc, element) => {
      const priceObj = goodsPrice.find(
        (p) => p.name.toLowerCase() === element.name.toLowerCase()
      );
      const cnyPrice = priceObj ? priceObj.price : 0;
      const usdPrice = `${cnyPrice} / ${exchangeRate}`;

      let totalGoodsPrice;
      if (parseInt(element.quantity) == 1) {
        totalGoodsPrice = usdPrice;
      } else {
        totalGoodsPrice = `${usdPrice} * ${element.quantity}`;
      }

      const domesticShippingCost =
        priceObj?.[inputKeyName.domesticShippingCost];
      if (domesticShippingCost) {
        const usdDomesticShippingCost = `${domesticShippingCost} / ${exchangeRate}`;
        totalGoodsPrice = `(${usdPrice} + ${usdDomesticShippingCost}) * ${element.quantity}`;
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
    const customizeObj = goodsPrice.find(
      (item) => item.name == customizePackage
    );
    if (!_.isEmpty(customizeObj)) {
      const cnyPrice = customizeObj.price;
      const exchangeRate = customizeObj?.exchangeRate;
      const usdPrice = `${cnyPrice} / ${exchangeRate}`;
      return { ...item, [inputKeyName.customPackageCost]: usdPrice };
    }
    return { ...item, [inputKeyName.customPackageCost]: "0" };
  });
};

export const removeObjKey = (skuList, keyName) => {
  return skuList.map((item) => {
    delete item[keyName];
    return item;
  });
};

/**
 * Calculates the total price to make each object.
 * @param {Array} skuList - The array of objects.
 * @param {Array} shippingCostArr - The array of element prices.
 * @returns {Array} The array of objects with their total price.
 */
export const addShippingCost = (skuList = [], shippingCostArr = []) => {
  const shipmentId = skuList[0].shipmentId;
  // const shipmentQuantity = skuList.reduce((acc, item) => {
  //   return acc + item.quantity;
  // }, 0);

  const domesticShippingCostObj = shippingCostArr.find(
    ({ shipmentId: id, isDomestic }) => id === shipmentId && isDomestic
  );
  const internationalShippingCostObj = shippingCostArr.find(
    ({ shipmentId: id, isInternational }) =>
      id === shipmentId && isInternational
  );

  // const itemPaymentCost = getItemPaymentCost({
  //   domesticShippingCostObj,
  //   internationalShippingCostObj,
  //   shipmentQuantity,
  // });

  let itemDomesticShippingCostFormula = 0,
    itemInternationalShippingCostFormula = 0;

  const shipmentDomesticCost = domesticShippingCostObj?.totalUsd ?? 0;
  const shipmentInternationalCost = internationalShippingCostObj?.totalUsd ?? 0;

  const dataFirstRow = 2; // trong excel row đầu tiên index = 2
  const totalUnitCell = `${outputColAlphabet.totalUnit}${dataFirstRow}`;
  if (domesticShippingCostObj) {
    itemDomesticShippingCostFormula = `${shipmentDomesticCost} / ${totalUnitCell}`;
  }

  if (internationalShippingCostObj) {
    itemInternationalShippingCostFormula = `${shipmentInternationalCost} / ${totalUnitCell}`;
  }

  const paymentCostDivisor =
    domesticShippingCostObj?.paymentCostDivisor ??
    internationalShippingCostObj?.paymentCostDivisor;

  return skuList.map((item, index) => {
    // first row trong excel phải + 2
    const rowIndex = index + 2;
    const domesticShippingCostCell = `${outputColAlphabet.domesticShippingCost}${rowIndex}`;
    const internationalShippingCostCell = `${outputColAlphabet.internationalShippingCost}${rowIndex}`;

    const itemPaymentCostFormula = `(${domesticShippingCostCell} + ${internationalShippingCostCell}) / ${paymentCostDivisor}`;

    return {
      ...item,
      domesticShippingCost: itemDomesticShippingCostFormula,
      internationalShippingCost: itemInternationalShippingCostFormula,
      // itemPaymentCost,
      itemPaymentCost: itemPaymentCostFormula,
    };
  });
};

const getItemPaymentCost = ({
  domesticShippingCostObj,
  internationalShippingCostObj,
  shipmentQuantity,
}) => {
  const paymentCostDivisor =
    domesticShippingCostObj?.paymentCostDivisor ??
    internationalShippingCostObj?.paymentCostDivisor;

  const shipmentDomesticCost = domesticShippingCostObj?.totalUsd ?? 0;
  const shipmentInternationalCost = internationalShippingCostObj?.totalUsd ?? 0;
  const shipmentPaymentCost = `(${shipmentDomesticCost} + ${shipmentInternationalCost}) / ${paymentCostDivisor}`;
  const itemShipmentPaymentCost = `${shipmentPaymentCost} / ${shipmentQuantity}`;
  return itemShipmentPaymentCost;
};

/**
 * Calculates the total price to make each object.
 * @param {Array} skuList - The array of objects.
 * @returns {Array} The array of objects with their total price.
 */
export const addCogsAndAmount = (skuList = []) => {
  return skuList.map((item) => {
    const {
      ppuPrice = "0",
      [inputKeyName.customPackageCost]: customPackageCost = "0",
      [inputKeyName.packingLabeling]: packingLabeling = "0",
      domesticShippingCost = "0",
      internationalShippingCost = "0",
      itemPaymentCost = "0",
      quantity,
    } = item;
    const formula = `${ppuPrice} + ${customPackageCost} + ${packingLabeling} + ${domesticShippingCost} + ${internationalShippingCost} + ${itemPaymentCost}`;
    // const cogs = eval(formula);
    // const amount = cogs * quantity;
    return { ...item, cogs: "", amount: "" };
  });
};

/**
 * Calculates the total price to make each object.
 * @param {Array} skuList - The array of objects.
 * @returns {Array} The array of objects with their total price.
 */
export const addTotalAmountAndQuantity = (skuList = []) => {
  let totalAmount = 0,
    totalQuantity = 0;
  skuList.forEach((item) => {
    const { amount, quantity } = item;
    totalAmount += amount;
    totalQuantity += quantity;
  });
  skuList[0].totalAmount = totalAmount;
  skuList[0].totalQuantity = totalQuantity;

  // chỉ chèn vào phần tử đầu
  return skuList.map((item, index) => {
    if (index == 0) {
      return { ...item, totalAmount, totalQuantity };
    } else {
      return { ...item, totalAmount: "", totalQuantity: "" };
    }
  });
};
