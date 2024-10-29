import JSZip from "jszip";
import _ from "lodash";
import { BadRequestError } from "../../error/bad-request-err.js";
import {
  addCogsAndAmount,
  addCustomizeCost,
  addPackingCost,
  addPaymentCostToCogs,
  addShippingAndPaymentCost,
  addTotalAmountAndQuantity,
  calculatePpuPrice,
} from "../../helper/calculate-helper/index.js";
import {
  addFileTypeAndOrder,
  getRawInputShippingCost,
  getRawOrder1Data,
  getShipmentData,
  getTotalSkuList,
  getTsvFilesArr,
  mergeTsvData,
  testTransformOrderList1Input,
  transformOrderList1Input,
  transformShippingCostInput,
} from "../../helper/data-input-helper/index.js";
import {
  addCogsFileToZip,
  addOrder1FileToZip,
  addShippingFileToZip,
  refactorElements,
  removeSkuKey,
} from "../../helper/data-output-helper/index.js";
import { createShipmentExcelBuffer } from "../../helper/xlsx-handler/index.js";
import { OUTPUT_KEY_NAME, INPUT_KEY_NAME } from "../../shared/constant.js";
import { isEmptyValue, mergeArrays, now } from "../../shared/utils.js";
import { ElementPrice } from "../../model/index.js";

/**
 * @param {Array.<Express.Multer.File>} files - An array of Multer file objects.
 * @returns {Promise<>}
 */
export const calculateGood = async (files = []) => {
  let mergeSkuList = [];
  let allInputShippingCost = [];
  let shipment;
  const zip = new JSZip();

  try {
    files = addFileTypeAndOrder(files);

    const tsvFilesArr = getTsvFilesArr(files) ?? [];
    let totalSkuList = getTotalSkuList(files) ?? [];
    let rawInputShippingCost = getRawInputShippingCost(files) ?? [];
    let rawJsonOrder1 = getRawOrder1Data(files) ?? [];
    let shipmentData = getShipmentData(files) ?? [];
    let shipmentObjAddToOrder = {};

    // tổng các loại sku
    let { totalSkuType, inputTsvDataArr, totalShipmentQuantity } =
      await mergeTsvData(tsvFilesArr, totalSkuList, shipmentData);

    let elementsPrice = [];
    for (const inputTsvData of inputTsvDataArr) {
      let inputShippingCost = [];
      let skuList = totalSkuList;
      shipment = "";
      let originalShipment, shipmentId;
      shipmentId = inputTsvData[0].shipmentId;

      if (!isEmptyValue(shipmentData)) {
        const shipmentObj = shipmentData.find(
          (item) => item?.shipmentId === shipmentId
        );
        shipment = shipmentObj?.shipment;
        originalShipment = shipmentObj?.originalShipment;
      }

      inputShippingCost = transformShippingCostInput(
        rawInputShippingCost,
        shipmentId,
        shipment,
        totalShipmentQuantity
      );

      const totalOrder1Data = testTransformOrderList1Input(
        rawJsonOrder1,
        shipmentId
      );
      const {
        elementsPriceArr = [],
        domesticShippingCostArr = [],
        internationalShippingCostArr = [],
        packingLabelingCostArr = [],
      } = totalOrder1Data;
      if (isEmptyValue(elementsPrice)) {
        elementsPrice = [...elementsPriceArr, ...packingLabelingCostArr];
      }
      inputShippingCost = [
        ...inputShippingCost,
        ...domesticShippingCostArr,
        ...internationalShippingCostArr,
      ].sort((a, b) => {
        return b?.isDomestic - a?.isDomestic;
      });

      skuList = mergeArrays(inputTsvData, skuList, INPUT_KEY_NAME.sku).filter(
        (item) => !_.isEmpty(item?.elements)
      );

      skuList = skuList.map((item) => {
        return { ...item, shipmentId, originalShipment };
      });

      skuList = addCustomizeCost(skuList, elementsPrice);
      skuList = addPackingCost(skuList, elementsPrice);
      skuList = addShippingAndPaymentCost(
        skuList,
        inputShippingCost,
        totalSkuType
      );
      skuList = addCogsAndAmount(skuList);
      skuList = addTotalAmountAndQuantity(skuList);
      skuList = calculatePpuPrice(skuList, elementsPrice);
      skuList = addPaymentCostToCogs(skuList, elementsPrice);

      const allElements = await addShipmentFileAndGetAllElements(
        skuList,
        inputShippingCost,
        originalShipment,
        totalShipmentQuantity,
        elementsPrice,
        zip
      );
      shipmentObjAddToOrder[originalShipment] = allElements;

      skuList = removeSkuKey(skuList);

      mergeSkuList = [...mergeSkuList, ...skuList];
      allInputShippingCost = [...allInputShippingCost, ...inputShippingCost];
    }

    await addCogsFileToZip(mergeSkuList, zip, shipment);
    await addShippingFileToZip(
      files,
      zip,
      shipmentObjAddToOrder,
      allInputShippingCost,
      inputTsvDataArr
    );
    await addOrder1FileToZip(files, zip, shipmentObjAddToOrder);

    const zipFile = zip.generateAsync({ type: "nodebuffer" });
    return zipFile;
  } catch (err) {
    console.log(`${now()}: [${err.stack}]`);
    throw new BadRequestError(err.message);
  }
};

/**
 * Calculates the total price to make each object.
 * @param {Array<ElementPrice>} elementsPrice - The array of element prices.
 */
const addShipmentFileAndGetAllElements = async (
  skuList,
  inputShippingCost,
  originalShipment,
  totalShipmentQuantity,
  elementsPrice = [],
  zip
) => {
  let allElements = skuList
    .map((sku) => {
      const {
        customizePackage = "",
        customPackageCost = "",
        cnyCustomPackageCost = "",
        customPackageOrder = "",
        totalUsdCustomPackageCost = "",
        totalCnyCustomPackageCost = "",
      } = sku;
      let { elements = [], quantity } = sku;

      if (customizePackage) {
        const customizePackageObj = {
          name: customizePackage,
          quantity: 1,
          cnyPrice: cnyCustomPackageCost,
          usdPrice: customPackageCost,
          order: customPackageOrder,
          totalCny: totalCnyCustomPackageCost,
          totalUsd: totalUsdCustomPackageCost,
        };
        elements = [...elements, customizePackageObj];
      }
      elements = elements.map((element) => {
        const elementQuantity = element?.quantity ?? 0;
        const totalElementQuantity = elementQuantity * quantity;
        return { ...element, quantity: totalElementQuantity };
      });
      return elements;
    })
    .flat();

  // add up quantity các thành phần
  allElements = Object.values(
    allElements.reduce((accumulator, current) => {
      if (accumulator[current.name]) {
        accumulator[current.name].quantity += current.quantity;
      } else {
        accumulator[current.name] = { ...current };
      }
      return accumulator;
    }, {})
  );

  allElements = allElements.map((element) => {
    let { name, quantity, usdPrice, cnyPrice, totalCny, totalUsd } = element;
    const elementPriceObj = elementsPrice.find(
      (item) => item?.name?.toLowerCase() == name?.toLowerCase()
    );
    totalCny = totalCny.replace("totalElementQuantity", quantity);
    totalUsd = totalUsd.replace("totalElementQuantity", quantity);
    if (!isEmptyValue(elementPriceObj)) {
      usdPrice = elementPriceObj.getUsdFormula();
      cnyPrice = elementPriceObj.cnyPrice;
    }
    return { ...element, usdPrice, cnyPrice, totalCny, totalUsd};
  });

  inputShippingCost.forEach((item) => {
    const { isDomestic, order = "" } = item;
    const totalShipmentUsd = item?.totalUsd;
    const totalShipmentCny = item?.totalCny;

    let shipmentSkuQuantity = 0;
    skuList.forEach((item) => {
      const { quantity = 0 } = item;
      shipmentSkuQuantity += quantity;
    });

    const totalCny = `${totalShipmentCny} / ${totalShipmentQuantity} * ${shipmentSkuQuantity}`;
    const totalUsd = `${totalShipmentUsd} / ${totalShipmentQuantity} * ${shipmentSkuQuantity}`;

    const shippingName = `${
      isDomestic
        ? OUTPUT_KEY_NAME.DOMESTIC_SHIPPING_COST
        : OUTPUT_KEY_NAME.INTERNATIONAL_SHIPPING_COST
    } ${originalShipment}`;

    let shippingElement = {
      name: shippingName,
      order,
      quantity: shipmentSkuQuantity,
    };
    shippingElement.totalCny = totalShipmentCny ? totalCny : "";
    shippingElement.totalUsd = totalShipmentUsd ? totalUsd : "";
    allElements.push(shippingElement);
  });

  skuList = removeSkuKey(skuList);
  const refactorAllElements = refactorElements(allElements);
  const shipmentResultFileBuffer = await createShipmentExcelBuffer(
    refactorAllElements
  );
  zip.file(`Shipment - ${originalShipment}.xlsx`, shipmentResultFileBuffer);
  return allElements;
};
