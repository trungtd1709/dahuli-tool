import _ from "lodash";
import { inputKeyName, OUTPUT_COL_ALPHABET } from "../../shared/constant.js";
import {
  evalCalculation,
  isEmptyValue,
  removeValueAndSplash,
  simplifyFormula,
} from "../../shared/utils.js";
import { ElementPrice } from "../../model/index.js";

/**
 * Calculates the total price to make each object.
 * @param {Array} skuList - The array of objects.
 * @param {Array<ElementPrice>} elementsPrice - The array of element prices.
 * @returns {Array} The array of objects with their total price.
 */
export const calculatePpuPrice = (skuList, elementsPrice) => {
  return skuList.map((good) => {
    let ppuPrice = good.elements.reduce((acc, element) => {
      const elementPrice = elementsPrice.find(
        (el) => el.name.toLowerCase() === element.name.toLowerCase()
      );
      const exchangeRate = elementPrice?.exchangeRate;
      const cnyPrice = elementPrice ? elementPrice.cnyPrice : 0;
      const usdPrice = `${cnyPrice} / ${exchangeRate}`;
      const quantity = parseInt(element.quantity) || 1;

      element.cnyPrice = cnyPrice;
      element.usdPrice = usdPrice;

      let totalElementsPrice = usdPrice;
      if (quantity > 1) {
        totalElementsPrice = `${usdPrice} * ${quantity}`;
      }

      const domesticShippingCost =
        elementPrice?.[inputKeyName.domesticShippingCost];
      if (domesticShippingCost) {
        const usdDomesticShippingCost = `${domesticShippingCost} / ${exchangeRate}`;
        totalElementsPrice = `(${usdPrice} + ${usdDomesticShippingCost}) * ${quantity}`;
      }

      if (!acc) {
        return totalElementsPrice;
      }

      return `${acc} + ${totalElementsPrice}`;
    }, "");

    ppuPrice = simplifyFormula(ppuPrice);

    const isSameExchangeRate = elementsPrice.every(
      (item) => item?.exchangeRate == elementsPrice[0]?.exchangeRate
    );

    if (isSameExchangeRate && elementsPrice[0]?.exchangeRate) {
      const exchangeRate = elementsPrice[0]?.exchangeRate;
      ppuPrice = `${removeValueAndSplash(
        ppuPrice,
        exchangeRate
      )} / ${exchangeRate}`;
    }

    return { ...good, ppuPrice };
  });
};

/**
 * Calculates the total price to make each object.
 * @param {Array} skuList - The array of objects.
 * @param {Array} cartonFee - The array of element prices.
 * @returns {Array} The array of objects with their total price.
 */
export const addPackingCost = (skuList, elementsPrice) => {
  // trong order1 neu co packingLabelingCost thì đã có trong key packingLabelingCost
  // tìm trong elementsPrice còn packing fee ko
  return skuList.map((item) => {
    const packing = item?.packing?.toLowerCase();
    const packingObj =
      elementsPrice.find((item) => item.name?.toLowerCase() == packing) ?? {};

    let { exchangeRate, price } = packingObj;
    if (exchangeRate && price) {
      price = `${price} / ${exchangeRate}`;
    }

    if (!_.isEmpty(price)) {
      return { ...item, packingLabelingCost: price };
    }
    return item;
  });
};

/**
 * Calculates the total price to make each object.
 * @param {Array} skuList - The array of objects.
 * @param {Array} elementsPrice - The array of element prices.
 * @returns {Array} The array of objects with their total price.
 */
export const addCustomizeCost = (skuList, elementsPrice) => {
  return skuList.map((item) => {
    const customizePackage = item?.customizePackage;
    const customizeObj = elementsPrice.find(
      (item) => item.name?.toLowerCase() == customizePackage?.toLowerCase()
    );

    let customPackageCost = "0";
    let cnyCustomPackageCost = "";

    if (!_.isEmpty(customizeObj)) {
      cnyCustomPackageCost = customizeObj.price;
      const exchangeRate = customizeObj?.exchangeRate;
      const usdPrice = `${cnyCustomPackageCost} / ${exchangeRate}`;
      customPackageCost = usdPrice;
    }
    return { ...item, customPackageCost, cnyCustomPackageCost };
  });
};

/**
 * Calculates the total price to make each object.
 * @param {Array} skuList - The array of objects.
 * @param {Array} shippingCostArr - The array of element prices.
 * @returns {Array} The array of objects with their total price.
 */
export const addShippingAndPaymentCost = (
  skuList = [],
  shippingCostArr = [],
  totalSkuType
) => {
  const { shipmentId } = skuList[0];

  const domesticShippingCostObj = shippingCostArr.find(
    ({ shipmentId: id, isDomestic }) => id === shipmentId && isDomestic
  );
  const internationalShippingCostObj = shippingCostArr.find(
    ({ shipmentId: id, isDomestic }) => id === shipmentId && isDomestic == false
  );

  const dataFirstRow = 2; // trong excel row đầu tiên index = 2
  const totalUnitColAlphabet = OUTPUT_COL_ALPHABET.TOTAL_UNIT;
  const totalShipmentQuantityFormula = `SUM(${totalUnitColAlphabet}${dataFirstRow}:${totalUnitColAlphabet}${
    totalSkuType + 1
  })`;
  // + 1 row bù cho row column name

  const totalShipmentQuantityDomestic =
    domesticShippingCostObj?.totalShipmentQuantity && totalSkuType
      ? totalShipmentQuantityFormula
      : null;
  const totalShipmentQuantityInternational =
    internationalShippingCostObj?.totalShipmentQuantity && totalSkuType
      ? totalShipmentQuantityFormula
      : null;

  const shipmentDomesticCost = domesticShippingCostObj?.totalUsd ?? 0;
  const shipmentInternationalCost = internationalShippingCostObj?.totalUsd ?? 0;

  const totalUnitCellDomestic =
    totalShipmentQuantityDomestic ??
    `${OUTPUT_COL_ALPHABET.TOTAL_UNIT}${dataFirstRow}`;
  const totalUnitCellInternational =
    totalShipmentQuantityInternational ??
    `${OUTPUT_COL_ALPHABET.TOTAL_UNIT}${dataFirstRow}`;

  const itemDomesticShippingCostFormula = domesticShippingCostObj
    ? `${shipmentDomesticCost} / ${totalUnitCellDomestic}`
    : 0;

  const itemInternationalShippingCostFormula = internationalShippingCostObj
    ? `${shipmentInternationalCost} / ${totalUnitCellInternational}`
    : 0;

  const paymentCostDivisor =
    domesticShippingCostObj?.paymentCostDivisor ??
    internationalShippingCostObj?.paymentCostDivisor;

  return skuList.map((item, index) => {
    // first row trong excel phải + 2
    const rowIndex = index + 2;
    const domesticShippingCostCell = `${OUTPUT_COL_ALPHABET.DOMESTIC_SHIPPING_COST}${rowIndex}`;
    const internationalShippingCostCell = `${OUTPUT_COL_ALPHABET.INTERNATIONAL_SHIPPING_COST}${rowIndex}`;

    const itemPaymentCostFormula = isEmptyValue(paymentCostDivisor)
      ? ""
      : `(${domesticShippingCostCell} + ${internationalShippingCostCell}) / ${paymentCostDivisor}`;
    return {
      ...item,
      domesticShippingCost: itemDomesticShippingCostFormula,
      internationalShippingCost: itemInternationalShippingCostFormula,
      // itemPaymentCost,
      itemPaymentCost: itemPaymentCostFormula,
    };
  });
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
      customPackageCost = "0",
      packingLabelingCost = "0",
      domesticShippingCost = "0",
      internationalShippingCost = "0",
      itemPaymentCost = "0",
      quantity,
    } = item;
    const formula = `${ppuPrice} + ${customPackageCost} + ${packingLabelingCost} + ${domesticShippingCost} + ${internationalShippingCost} + ${itemPaymentCost}`;
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
  const { totalAmount, totalQuantity } = skuList.reduce(
    (acc, { amount, quantity }) => {
      acc.totalAmount += amount;
      acc.totalQuantity += quantity;
      return acc;
    },
    { totalAmount: 0, totalQuantity: 0 }
  );

  // chỉ chèn vào phần tử đầu
  return skuList.map((item, index) => {
    if (index == 0) {
      return { ...item, totalAmount, totalQuantity };
    } else {
      return { ...item, totalAmount: "", totalQuantity: "" };
    }
  });
};
