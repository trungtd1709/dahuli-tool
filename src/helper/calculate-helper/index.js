import _ from "lodash";
import { INPUT_KEY_NAME, OUTPUT_COL_ALPHABET } from "../../shared/constant.js";
import {
  compareStringsIgnoreSpaces,
  evalCalculation,
  isEmptyValue,
  removeValueAndSplash,
  simplifyFormula,
} from "../../shared/utils.js";
import { ElementPrice } from "../../model/index.js";
import { BadRequestError } from "../../error/bad-request-err.js";
import {
  CANT_FIND_USD_PRICE_FOR_ELEMENT,
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
      const { SKU, originalShipment } = sku;
      if(element.name == "Rotating Folding Hook (Black)"){
        console.log(originalShipment);
        console.log("test");
      }

      // quantity của 1 element trong SKU
      const elementQuantity = parseInt(element?.quantity) ?? 1;
      const elementPrice = findEleWithLowestFileOrder(
        elementsPrice.filter(
          (el) =>
            // el.name.toLowerCase() === element.name.toLowerCase() &&
            compareStringsIgnoreSpaces(el.name, element.name) &&
            el.leftQuantity > 0
        )
      );

      if (!elementPrice) {
        throw new BadRequestError(`${MISSING_ELEMENT_DATA}: ${element.name}`);
      }

      const exchangeRate = elementPrice?.exchangeRate;
      const cnyPrice = elementPrice.getCnyFormula();
      let usdPrice = elementPrice.getUsdFormula();
      const skuQuantity = sku?.quantity ?? 0;
      const quantity = elementQuantity * skuQuantity;
      const remainingQuantity = elementPrice.setLeftQuantity(quantity);

      let eleShipmentTotalCny = "";
      let eleShipmentTotalUsd = "";
      let order = elementPrice.order;
      // TH này ko cần tìm thêm gì, tính luôn ppu
      if (remainingQuantity <= 0) {
        /// ko bỏ comment này
        // newPpuPrice = `${usdPrice} * ${quantity} / quantityCell`;
        newPpuPrice = `${elementPrice.getUsdFormula()} * ${elementQuantity}`;
        if (!isEmptyValue(elementPrice.getCnyFormula())) {
          // eleShipmentTotalCny = `${elementPrice.getCnyFormula()} * totalElementQuantity`;
          eleShipmentTotalCny = `${elementPrice.getCnyFormula()} * ${quantity}`;
        }
        if (!isEmptyValue(elementPrice.getUsdFormula())) {
          // eleShipmentTotalUsd = `${elementPrice.getUsdFormula()} * totalElementQuantity`;
          eleShipmentTotalUsd = `${elementPrice.getUsdFormula()} * ${quantity}`;
        }
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
        const quantityGoToNewOrder = quantity - remainingQuantity;
        usdPrice = `(${elementPrice.getUsdFormula()} * ${quantityGoToNewOrder} + ${newElementPrice.getUsdFormula()} * ${remainingQuantity}) / ${quantity}`;
        order = `${order} + ${newElementPrice.order}`;
        newElementPrice.setLeftQuantity(remainingQuantity);
        if (isEmptyValue(newElementPrice.getUsdFormula())) {
          console.log(newElementPrice.getUsdFormula());
          throw new BadRequestError(
            `${CANT_FIND_USD_PRICE_FOR_ELEMENT}: ${newElementPrice.name} in file : ${newElementPrice.fileName}`
          );
        }
        newPpuPrice = `${elementPrice.getUsdFormula()} * ${quantityGoToNewOrder} / quantityCell + ${newElementPrice.getUsdFormula()} * ${remainingQuantity} / quantityCell`;
        
        if (!isEmptyValue(elementPrice.getUsdFormula())) {
          // eleShipmentTotalUsd = `${elementPrice.getUsdFormula()} * ${quantityGoToNewOrder} + ${newElementPrice.getUsdFormula()} * (totalElementQuantity - ${quantityGoToNewOrder})`;
          eleShipmentTotalUsd = `${elementPrice.getUsdFormula()} * ${quantityGoToNewOrder} + ${newElementPrice.getUsdFormula()} * ${remainingQuantity}`;
        }
        if (!isEmptyValue(elementPrice.getCnyFormula())) {
          // eleShipmentTotalCny = `${elementPrice.getCnyFormula()} * ${quantityGoToNewOrder} + ${newElementPrice.getCnyFormula()} * (totalElementQuantity - ${quantityGoToNewOrder})`;
          eleShipmentTotalCny = `${elementPrice.getCnyFormula()} * ${quantityGoToNewOrder} + ${newElementPrice.getCnyFormula()} * ${remainingQuantity}`;
        }
      }
      element.usdPrice = usdPrice;
      element.order = order;
      element.totalUsd = eleShipmentTotalUsd;
      element.totalCny = eleShipmentTotalCny;

      // let totalElementsPrice = usdPrice;
      // if (quantity > 1) {
      //   totalElementsPrice = `${usdPrice} * ${quantity}`;
      // }

      // const domesticShippingCost =
      //   elementPrice?.[INPUT_KEY_NAME.DOMESTIC_SHIPPING_COST];
      // if (domesticShippingCost) {
      //   const usdDomesticShippingCost = `${domesticShippingCost} / ${exchangeRate}`;
      //   totalElementsPrice = `(${usdPrice} + ${usdDomesticShippingCost}) * ${quantity}`;
      // }

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
      elementsPrice.find((item) =>
        compareStringsIgnoreSpaces(item.name, packing)
      ) ?? {};

    let packingLabelingCost;
    if (!isEmptyValue(packingObj)) {
      packingLabelingCost = packingObj.getUsdFormula();
    }

    if (!_.isEmpty(packingLabelingCost)) {
      return { ...item, packingLabelingCost };
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
export const addPpuPaymentCost = (skuList, elementsPrice) => {
  return skuList.map((sku, index) => {
    sku.elements.forEach((element) => {
      const elementName = element?.name;
      const elementPrice =
        elementsPrice.find(
          (item) => item.name == elementName && item.paymentCostLeftQuantity > 0
        ) ?? {};
      const { paymentCostDivisor } = elementPrice;
      if (paymentCostDivisor) {
        // if(paymentCostDivisor == '200'){
        //   console.log('jhgbjhkerbjkebrjher');
        // }
        elementPrice.setPaymentCostLeftQuantity(
          element.quantity * sku.quantity
        );
        const ppuPaymentCostFormula = `${OUTPUT_COL_ALPHABET.PPU}${
          index + 2
        }/${paymentCostDivisor}`;
        sku = {
          ...sku,
          ppuPaymentCost: ppuPaymentCostFormula,
        };
      }
    });
    return sku;
  });
};

/**
 * Calculates the total price to make each object.
 * @param {Array} skuList - The array of objects.
 * @param {Array<ElementPrice>} elementsPrice - The array of element prices.
 * @returns {Array} The array of objects with their total price.
 */
export const addCustomizeAndPaymentCost = (skuList, elementsPrice) => {
  return skuList.map((item, index) => {
    const { SKU } = item;
    const customizePackage = item?.customizePackage;
    const customizeObj = findEleWithLowestFileOrder(
      elementsPrice.filter(
        (el) =>
          // el.name?.toLowerCase() == customizePackage?.toLowerCase() &&
          compareStringsIgnoreSpaces(el.name, customizePackage) &&
          el.leftQuantity > 0
      )
    );

    let cnyCustomPackageCost = "";
    const quantity = item?.quantity;
    let customPackageCostFormula = "0";
    let customPackageCostPaymentCost;
    let totalCnyCustomPackageCost;
    let totalUsdCustomPackageCost;
    const customPackageCostCellAddress = `${
      OUTPUT_COL_ALPHABET.CUSTOM_PACKAGE_COST
    }${index + 2}`;

    if (!_.isEmpty(customizeObj)) {
      const { paymentCostDivisor } = customizeObj;
      if (!isEmptyValue(paymentCostDivisor)) {
        customPackageCostPaymentCost = `${customPackageCostCellAddress} / ${paymentCostDivisor}`;
      }

      item.customPackageOrder = customizeObj?.order;
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
          // số lượng element tính ở file order đầu
          const firstFileQuantity = quantity - remainingQuantity;
          const secondFilePaymentCostDivisor =
            secondCustomizeObj.getPaymentCostDivisor();

          if (
            !isEmptyValue(paymentCostDivisor) &&
            !isEmptyValue(secondFilePaymentCostDivisor)
          ) {
            customPackageCostPaymentCost = `${customPackageCostCellAddress} / ${paymentCostDivisor} * ${firstFileQuantity} / ${quantity} + ${customPackageCostCellAddress} / ${secondFilePaymentCostDivisor} * ${remainingQuantity} / ${quantity}`;
          }

          secondCustomizeObj.setLeftQuantity(remainingQuantity);
          const secondCustomizeUsdFormula = secondCustomizeObj.getUsdFormula();

          if (
            !isEmptyValue(customizeObj.getUsdFormula()) &&
            !isEmptyValue(secondCustomizeUsdFormula)
          ) {
            // "270.6 / 660 * 244 / quantityCell + NaN * 76 / quantityCell"
            customPackageCostFormula = `${customizeObj.getUsdFormula()} * ${firstFileQuantity} / quantityCell + ${secondCustomizeUsdFormula} * ${remainingQuantity} / quantityCell`;
            totalUsdCustomPackageCost = `${customizeObj.getUsdFormula()} * ${firstFileQuantity} + ${secondCustomizeUsdFormula} * ${remainingQuantity}`;
          }

          if (
            !isEmptyValue(customizeObj.getCnyFormula()) &&
            !isEmptyValue(secondCustomizeObj.getCnyFormula())
          ) {
            totalCnyCustomPackageCost = `${customizeObj.getCnyFormula()} * ${firstFileQuantity} + ${secondCustomizeObj.getCnyFormula()} * ${remainingQuantity}`;
          }

          item.customPackageOrder = `${item.customPackageOrder} + ${secondCustomizeObj.order}`;
        } else {
          throw new BadRequestError(
            `${NOT_ENOUGHT_CUSTOM_PACKAGE_QUANTITY}: ${remainingQuantity} cho ${customizeObj.name}`
          );
        }
      }

      // th này múc luôn
      else {
        customPackageCostFormula = customizeObj.getUsdFormula();
        if (!isEmptyValue(customPackageCostFormula)) {
          totalUsdCustomPackageCost = `${customPackageCostFormula} * ${quantity}`;
        }
        if (!isEmptyValue(customizeObj.getCnyFormula())) {
          totalCnyCustomPackageCost = `${customizeObj.getCnyFormula()} * ${quantity}`;
        }
      }
    }
    return {
      ...item,
      customPackageCost: customPackageCostFormula,
      customPackageCostPaymentCost,
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
  return skuList.map((item, index) => {
    const { shipmentId } = skuList[index];

    const domesticShippingCostObj = shippingCostArr.find(
      ({ shipmentId: id, isDomestic }) => id === shipmentId && isDomestic
    );
    const internationalShippingCostObj = shippingCostArr.find(
      ({ shipmentId: id, isDomestic }) =>
        id === shipmentId && isDomestic == false
    );

    const dataFirstRow = 2; // trong excel row đầu tiên index = 2
    const totalUnitColAlphabet = OUTPUT_COL_ALPHABET.TOTAL_UNIT;

    const shipmentDomesticCost = domesticShippingCostObj?.totalUsd ?? 0;
    const shipmentInternationalCost =
      internationalShippingCostObj?.totalUsd ?? 0;

    const totalUnitCellDomestic = `${totalUnitColAlphabet}${dataFirstRow}`;
    const totalUnitCellInternational = `${totalUnitColAlphabet}${dataFirstRow}`;

    const itemDomesticShippingCostFormula = domesticShippingCostObj
      ? `${shipmentDomesticCost} / ${totalUnitCellDomestic}`
      : 0;

    const itemInternationalShippingCostFormula = internationalShippingCostObj
      ? `${shipmentInternationalCost} / ${totalUnitCellInternational}`
      : 0;

    const paymentCostDivisor =
      domesticShippingCostObj?.paymentCostDivisor ??
      internationalShippingCostObj?.paymentCostDivisor;

    // first row trong excel phải + 2
    const rowIndex = index + 2;
    const domesticShippingCostCell = `${OUTPUT_COL_ALPHABET.DOMESTIC_SHIPPING_COST}${rowIndex}`;
    const internationalShippingCostCell = `${OUTPUT_COL_ALPHABET.INTERNATIONAL_SHIPPING_COST}${rowIndex}`;

    let shippingPaymentCostFormula;
    if (!isEmptyValue(paymentCostDivisor)) {
      if (itemDomesticShippingCostFormula) {
        shippingPaymentCostFormula = `${domesticShippingCostCell} / ${paymentCostDivisor}`;
      }
      if (itemInternationalShippingCostFormula) {
        shippingPaymentCostFormula = `${internationalShippingCostCell} / ${paymentCostDivisor}`;
      }
      if (
        itemDomesticShippingCostFormula &&
        itemInternationalShippingCostFormula
      ) {
        shippingPaymentCostFormula = `(${domesticShippingCostCell} + ${internationalShippingCostCell}) / ${paymentCostDivisor}`;
      }
    }
    // const shippingPaymentCostFormula = isEmptyValue(paymentCostDivisor)
    //   ? ""
    //   : `(${domesticShippingCostCell} + ${internationalShippingCostCell}) / ${paymentCostDivisor}`;
    return {
      ...item,
      domesticShippingCost: itemDomesticShippingCostFormula,
      internationalShippingCost: itemInternationalShippingCostFormula,
      shippingPaymentCost: shippingPaymentCostFormula,
    };
  });
};

/**
 * cái này thêm key name thôi
 * @param {Array} skuList - The array of objects.
 * @returns {Array} The array of objects with their total price.
 */
export const addCogsAndAmount = (skuList = []) => {
  return skuList.map((item) => {
    return { ...item, cogs: "", amount: "" };
  });
};

/**
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

export function addQuantityToFormula(formula, commonFactor, quantity) {
  // Create a regex pattern to find the `commonFactor` in the formula
  const regex = new RegExp(`(${commonFactor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})( *\\* *\\d+)?`, 'g');

  // Replace the common factor in the formula
  const updatedFormula = formula.replace(regex, (match, baseFactor, multiplierPart) => {
      if (multiplierPart) {
          // If there's already a multiplier, update it by adding the quantity
          const currentMultiplier = parseFloat(multiplierPart.replace(/[^0-9.]/g, ''));
          const newMultiplier = currentMultiplier + quantity;
          return `${baseFactor} * ${newMultiplier}`;
      } else {
          // If no multiplier exists, add the quantity as the new multiplier
          return `${baseFactor} * ${quantity + 1}`; // Add 1 to include the original single instance
      }
  });

  return updatedFormula;
}