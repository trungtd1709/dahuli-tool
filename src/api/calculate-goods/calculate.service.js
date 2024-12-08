import JSZip from "jszip";
import _ from "lodash";
import { BadRequestError } from "../../error/bad-request-err.js";
import {
  addCogsAndAmount,
  addCustomizeAndPaymentCost,
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
  transformOrder1List,
  transformShippingCostInput,
} from "../../helper/data-input-helper/index.js";
import {
  addCogsFileToZip,
  addOrder1FileToZip,
  getAllShipmentElements,
  addShippingFileToZip,
  removeSkuKey,
  addShipmentFileToZip,
} from "../../helper/data-output-helper/index.js";
import { INPUT_KEY_NAME } from "../../shared/constant.js";
import { isEmptyValue, mergeArrays, now } from "../../shared/utils.js";

/**
 * @param {Array.<Express.Multer.File>} files - An array of Multer file objects.
 * @returns {Promise<>}
 */
export const calculateGood = async (files = []) => {
  let allSkuList = [];
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
    let allElements = {};

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
        originalShipment,
        totalShipmentQuantity
      );

      const totalOrder1Data = transformOrder1List(
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

      skuList = mergeArrays(inputTsvData, skuList, INPUT_KEY_NAME.SKU).filter(
        (item) => !_.isEmpty(item?.elements)
      );
      skuList = skuList.map((item) => {
        return { ...item, shipmentId, originalShipment };
      });
      // skuList = addCustomizeAndPaymentCost(skuList, elementsPrice);
      skuList = addPackingCost(skuList, elementsPrice);
      // skuList = addShippingAndPaymentCost(
      //   skuList,
      //   inputShippingCost,
      //   totalSkuType
      // );
      skuList = addCogsAndAmount(skuList);
      skuList = addTotalAmountAndQuantity(skuList);
      skuList = calculatePpuPrice(skuList, elementsPrice);
      // skuList = addPaymentCostToCogs(skuList, elementsPrice);

      const allShipmentElements = await getAllShipmentElements(
        skuList,
        elementsPrice,
      );

      allElements[originalShipment] = allShipmentElements;      
      allSkuList = [...allSkuList, ...skuList];
      allInputShippingCost = [...allInputShippingCost, ...inputShippingCost];
    }
    allSkuList = addCustomizeAndPaymentCost(allSkuList, elementsPrice);
    allSkuList = addShippingAndPaymentCost(
      allSkuList,
      allInputShippingCost,
      totalSkuType
    );
    allSkuList = addPaymentCostToCogs(allSkuList, elementsPrice);
    allSkuList = removeSkuKey(allSkuList);

    await addCogsFileToZip(allSkuList, zip, shipment);
    await addOrder1FileToZip(files, zip, allElements);

    allElements = await addShipmentFileToZip(
      allElements,
      allInputShippingCost,
      allSkuList,
      zip,
    );
    
    await addShippingFileToZip(
      files,
      zip,
      allElements,
      allInputShippingCost,
      inputTsvDataArr
    );

    const zipFile = zip.generateAsync({ type: "nodebuffer" });
    return zipFile;
  } catch (err) {
    console.log(`${now()}: [${err.stack}]`);
    throw new BadRequestError(err.message);
  }
};
