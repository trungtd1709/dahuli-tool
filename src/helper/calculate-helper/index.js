import _ from "lodash";
import { inputKeyName, OUTPUT_COL_ALPHABET } from "../../shared/constant.js";
import {
  evalCalculation,
  isEmptyValue,
  removeValueAndSplash,
  simplifyFormula,
} from "../../shared/utils.js";
import { ElementPrice } from "../../model/index.js";
import { BadRequestError } from "../../error/bad-request-err.js";
import {
  MISSING_ELEMENT_DATA,
  NOT_ENOUGHT_CUSTOM_PACKAGE_QUANTITY,
} from "../../shared/err-const.js";

/**
 * Calculates the total price to make each object.
 * @param {Array} skuList - The array of objects.
 * @param {Array<ElementPrice>} elementsPrice - The array of element prices.
 * @returns {Array} The array of objects with their total price.
 */
export const calculatePpuPrice = (skuList, elementsPrice) => {
  return skuList.map((sku) => {
    let ppuPrice = sku.elements.reduce((acc, element) => {
      let newPpuPrice = "";
      const elementIndex = sku.elements.findIndex(
        (el) => el.name == element.name
      );

      const elementPrice = findEleWithLowestFileOrder(
        elementsPrice.filter(
          (el) =>
            el.name.toLowerCase() === element.name.toLowerCase() &&
            el.leftQuantity > 0
        )
      );

      if (!elementPrice) {
        throw new BadRequestError(MISSING_ELEMENT_DATA);
      }

      const exchangeRate = elementPrice?.exchangeRate;
      const cnyPrice = elementPrice.getCnyFormula();
      const usdPrice = elementPrice.getUsdFormula();
      const skuQuantity = sku?.quantity ?? 0;
      const quantity = (parseInt(element.quantity) || 1) * skuQuantity;

      const remainingQuantity = elementPrice.setLeftQuantity(quantity);

      let eleShipmentTotalCny = "";
      let eleShipmentTotalUsd = "";
      let order = elementPrice.order;
      // TH này ko cần tìm thêm gì, tính luôn ppu
      if (remainingQuantity <= 0) {
        newPpuPrice = `${usdPrice} * ${quantity} / quantityCell`;
        eleShipmentTotalCny = `${cnyPrice} * ${quantity}`;
        eleShipmentTotalUsd = `${cnyPrice} / ${exchangeRate} * ${quantity}`;
      }
      if (remainingQuantity > 0) {
        const newElementPrice = findEleWithLowestFileOrder(
          elementsPrice.filter(
            (el) =>
              el.name.toLowerCase() === element.name.toLowerCase() &&
              el.leftQuantity > 0 &&
              el.fileOrder > elementPrice.fileOrder
          )
        );

        if (!newElementPrice) {
          throw new BadRequestError(MISSING_ELEMENT_DATA);
        }
        order = `${order} + ${newElementPrice.order}`;
        newElementPrice.setLeftQuantity(remainingQuantity);
        newPpuPrice = `${elementPrice.getUsdFormula()} * ${
          quantity - remainingQuantity
        } / quantityCell + ${newElementPrice.getUsdFormula()} * ${remainingQuantity} / quantityCell`;

        eleShipmentTotalUsd = `${elementPrice.getUsdFormula()} * ${
          quantity - remainingQuantity
        } + ${newElementPrice.getUsdFormula()} * ${remainingQuantity}`;

        eleShipmentTotalCny = `${elementPrice.getCnyFormula()} * ${
          quantity - remainingQuantity
        } + ${newElementPrice.getCnyFormula()} * ${remainingQuantity}`;
      }
      element.usdPrice = usdPrice;
      element.order = order;
      element.totalUsd = eleShipmentTotalUsd;
      element.totalCny = eleShipmentTotalCny;
      // sku.elements[elementIndex].order = order;

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
        return newPpuPrice;
      }
      const ppuPrice = `${acc} + ${newPpuPrice}`;
      return ppuPrice;
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

    return { ...sku, ppuPrice };
  });
};

/**
 * Calculates the total price to make each object.
 * @param {Array} skuList - The array of objects.
 * @param {Array<ElementPrice>} elementsPrice - The array of element prices.
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
 * @param {Array<ElementPrice>} elementsPrice - The array of element prices.
 * @returns {Array} The array of objects with their total price.
 */
export const addCustomizeCost = (skuList, elementsPrice) => {
  return skuList.map((item) => {
    const customizePackage = item?.customizePackage;
    const customizeObj = findEleWithLowestFileOrder(
      elementsPrice.filter(
        (el) =>
          el.name?.toLowerCase() == customizePackage?.toLowerCase() &&
          el.leftQuantity > 0
      )
    );

    let cnyCustomPackageCost = "";
    const quantity = item?.quantity;
    let customPackageCostFormula = "0";
    let totalCnyCustomPackageCost;
    let totalUsdCustomPackageCost;

    item.customPackageOrder = customizeObj.order;
    if (!_.isEmpty(customizeObj)) {
      cnyCustomPackageCost = customizeObj.cnyPrice;
      const remainingQuantity = customizeObj.setLeftQuantity(quantity);
      if (remainingQuantity > 0) {
        const secondCustomizeObj = findEleWithLowestFileOrder(
          elementsPrice.filter(
            (el) =>
              el.name?.toLowerCase() == customizePackage?.toLowerCase() &&
              el.leftQuantity > 0
          )
        );
        if (secondCustomizeObj) {
          secondCustomizeObj.setLeftQuantity(remainingQuantity);
          customPackageCostFormula = `${customizeObj.getUsdFormula()} * ${
            quantity - remainingQuantity
          } / quantityCell + ${secondCustomizeObj.getUsdFormula()} * ${remainingQuantity} / quantityCell`;
          totalUsdCustomPackageCost = `${customizeObj.getUsdFormula()} * ${
            quantity - remainingQuantity
          } + ${secondCustomizeObj.getUsdFormula()} * ${remainingQuantity}`;
          totalCnyCustomPackageCost = `${customizeObj.getCnyFormula()} * ${
            quantity - remainingQuantity
          } + ${secondCustomizeObj.getCnyFormula()} * ${remainingQuantity}`;
          item.customPackageOrder = `${item.customPackageOrder} + ${secondCustomizeObj.order}`;
        } else {
          throw new BadRequestError(NOT_ENOUGHT_CUSTOM_PACKAGE_QUANTITY);
        }
      }
      // th này múc luôn
      else {
        customPackageCostFormula = customizeObj.getUsdFormula();
        totalUsdCustomPackageCost = `${customPackageCostFormula} * ${quantity}`;
        totalCnyCustomPackageCost = `${customizeObj.getCnyFormula()} * ${quantity}`;
      }
    }
    return {
      ...item,
      customPackageCost: customPackageCostFormula,
      cnyCustomPackageCost,
      totalUsdCustomPackageCost,
      totalCnyCustomPackageCost,
    };
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

/// tìm ele có file order nhỏ nhất từ những TH đã filter
/**
 * Calculates the total price to make each object.
 * @returns {ElementPrice} The array of objects with their total price.
 */
const findEleWithLowestFileOrder = (filteredElementsPrice = []) => {
  const result = filteredElementsPrice.reduce((currentValue, nextValue) => {
    // If currentValue is null, we return nextValue (i.e., first valid object)
    if (currentValue === null) {
      return nextValue;
    }
    // Otherwise, return the one with the smaller fileOrder
    return nextValue?.fileOrder < currentValue?.fileOrder
      ? nextValue
      : currentValue;
  }, null);
  return result;
};
