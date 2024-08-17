import _ from "lodash";
import { BadRequestError } from "../../error/bad-request-err.js";
import {
  addCogsAndAmount,
  addCustomizeCost,
  addPackingCost,
  addShippingAndPaymentCost,
  addTotalAmountAndQuantity,
  calculatePpuPrice,
  removeObjKey,
} from "../../helper/calculate-helper/index.js";
import {
  transformOrderList1Input,
  transformShipmentListInput,
  transformShippingCostInput,
  transformSkuListInput,
} from "../../helper/data-input-helper/index.js";
import { refactorSkuListFunc } from "../../helper/data-output-helper/index.js";
import { getDataTsvFile } from "../../helper/tsv-helper/index.js";
import {
  getFileType,
  jsonToXlsx,
  xlsxToJSON,
} from "../../helper/xlsx-helper/index.js";
import {
  FILE_TYPE,
  inputKeyName,
  keyPreferences,
} from "../../shared/constant.js";
import { MISSING_TSV_FILE } from "../../shared/err-const.js";
import { isEmptyValue, mergeArrays } from "../../shared/utils.js";

/**
 * @param {Array.<Express.Multer.File>} files - An array of Multer file objects.
 * @returns {Promise<void>}
 */
export const calculateGood = async (files = []) => {
  let mergeSkuList = [];
  let totalShipmentQuantity = 0;

  try {
    files = files.map((file) => {
      const fileType = getFileType(file);
      return { ...file, fileType };
    });

    const tsvFilesArr = files.filter((file) => file.fileType == FILE_TYPE.TSV);
    if (isEmptyValue(tsvFilesArr)) {
      throw new BadRequestError(MISSING_TSV_FILE);
    }
    for (const tsvFile of tsvFilesArr) {
      const { shipmentQuantity } = await getDataTsvFile({ file: tsvFile });
      totalShipmentQuantity += shipmentQuantity;
    }

    for (const tsvFile of tsvFilesArr) {
      let inputShippingCost = [];
      let inputPrinttingFee = [];
      let skuList = [];
      let elementsPrice = [];
      let shipmentData = [];
      let shipment, originalShipment, shipmentId;

      const { inputTsvData, shipmentQuantity } = await getDataTsvFile({
        file: tsvFile,
      });
      shipmentId = inputTsvData[0].shipmentId;

      const shipmentFile = files.find(
        (file) => file.fileType == FILE_TYPE.SHIPMENT
      );

      if (!isEmptyValue(shipmentFile)) {
        shipmentData = transformShipmentListInput(
          xlsxToJSON({ file: shipmentFile })
        );
        const shipmentObj = shipmentData.find(
          (item) => item?.shipmentId == shipmentId
        );
        shipment = shipmentObj?.shipment;
        originalShipment = shipmentObj?.originalShipment;
      }

      for await (const file of files) {
        const fileType = getFileType(file);

        switch (fileType) {
          case FILE_TYPE.SHIPPING: {
            const inputFileShippingCost = transformShippingCostInput(
              xlsxToJSON({
                file: file,
                paymentCostKeyName: inputKeyName.totalUsd,
                exchangeRateKeyName: inputKeyName.totalUsd,
                isShippingCost: true,
              }),
              shipmentId,
              shipment,
              totalShipmentQuantity
            );
            inputShippingCost = [
              ...inputShippingCost,
              ...inputFileShippingCost,
            ];
            break;
          }

          case FILE_TYPE.SKU_LIST: {
            skuList = transformSkuListInput(xlsxToJSON({ file: file }));
            break;
          }

          case FILE_TYPE.ORDER1: {
            const order1Input = transformOrderList1Input(
              xlsxToJSON({
                file: file,
                exchangeRateKeyName: inputKeyName.totalUsd,
              }),
              shipmentId
            );
            const {
              elementsPriceArr = [],
              domesticShippingCostArr = [],
              internationalShippingCostArr = [],
              packingLabelingCostArr = [],
              inputPrinttingFeeArr = [],
            } = order1Input;
            elementsPrice = [
              ...elementsPriceArr,
              ...elementsPrice,
              ...packingLabelingCostArr,
            ];
            inputShippingCost = [
              ...inputShippingCost,
              ...domesticShippingCostArr,
              ...internationalShippingCostArr,
            ];
            break;
          }
          default:
        }
      }

      skuList = mergeArrays(inputTsvData, skuList, inputKeyName.sku).filter(
        (item) => !_.isEmpty(item?.elements)
      );

      skuList = skuList.map((item) => {
        return { ...item, shipmentId, originalShipment: originalShipment };
      });

      const elementsPriceAndPrinttingPackingFee = [
        ...elementsPrice,
        ...inputPrinttingFee,
      ];

      skuList = calculatePpuPrice(skuList, elementsPriceAndPrinttingPackingFee);
      skuList = addCustomizeCost(skuList, elementsPriceAndPrinttingPackingFee);
      skuList = addPackingCost(skuList, elementsPriceAndPrinttingPackingFee);
      skuList = addShippingAndPaymentCost(skuList, inputShippingCost);
      skuList = addCogsAndAmount(skuList);
      skuList = addTotalAmountAndQuantity(skuList);
      skuList = removeSkuKey(skuList);

      mergeSkuList = [...mergeSkuList, ...skuList];
    }

    const refactorSkuList = refactorSkuListFunc(mergeSkuList);
    const xlsxBuffer = await jsonToXlsx({ json: refactorSkuList });
    // return { xlsxBuffer, shipment, shipmentId };
    return xlsxBuffer;
  } catch (err) {
    console.log(err);
    throw new BadRequestError(err.message);
  }
};

const removeSkuKey = (skuList = []) => {
  skuList = removeObjKey(skuList, inputKeyName.elements);
  skuList = removeObjKey(skuList, keyPreferences.packing);
  skuList = removeObjKey(skuList, "customizePackage");
  return skuList;
};

// const filterSku = (skuList = []) => {
//   return skuList.filter(item => item?.)
// }
