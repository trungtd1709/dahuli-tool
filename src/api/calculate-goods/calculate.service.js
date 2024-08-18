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
  KEY_PREFERENCES,
} from "../../shared/constant.js";
import {
  MISSING_ORDER_1_FILE,
  MISSING_SKU_LIST_FILE,
  MISSING_TSV_FILE,
} from "../../shared/err-const.js";
import { isEmptyValue, mergeArrays, now } from "../../shared/utils.js";

/**
 * @param {Array.<Express.Multer.File>} files - An array of Multer file objects.
 * @returns {Promise<void>}
 */
export const calculateGood = async (files = []) => {
  let mergeSkuList = [];
  let totalShipmentQuantity = 0;
  let totalSkuList = [];
  let rawInputShippingCost = [];
  let rawJsonOrder1 = [];
  let totalOrder1Data = {};
  let shipmentData = [];

  try {
    files = files.map((file) => {
      const fileType = getFileType(file);
      return { ...file, fileType };
    });

    const tsvFilesArr = files.filter((file) => file.fileType == FILE_TYPE.TSV);
    if (isEmptyValue(tsvFilesArr)) {
      throw new BadRequestError(MISSING_TSV_FILE);
    }

    const skuListFiles = files.filter(
      (file) => file.fileType == FILE_TYPE.SKU_LIST
    );
    if (isEmptyValue(skuListFiles)) {
      throw new BadRequestError(MISSING_SKU_LIST_FILE);
    }

    skuListFiles.forEach((skuListFile) => {
      const rawSkuListData = xlsxToJSON({ file: skuListFile });
      totalSkuList = [...totalSkuList, ...rawSkuListData];
      // raw skulist json
    });
    totalSkuList = transformSkuListInput(totalSkuList);

    const shippingListFiles = files.filter(
      (file) => file.fileType == FILE_TYPE.SHIPPING
    );

    if (!isEmptyValue(shippingListFiles)) {
      shippingListFiles.forEach((shippingFile) => {
        const rawJson = xlsxToJSON({
          file: shippingFile,
          paymentCostKeyName: inputKeyName.totalUsd,
          exchangeRateKeyName: inputKeyName.totalUsd,
          isShippingCost: true,
        });
        rawInputShippingCost = [...rawInputShippingCost, ...rawJson];
      });
    }

    const order1Files = files.filter(
      (file) => file.fileType == FILE_TYPE.ORDER_1
    );
    if (isEmptyValue(order1Files)) {
      throw new BadRequestError(MISSING_ORDER_1_FILE);
    }

    for (const order1File of order1Files) {
      const rawOrder1Data = xlsxToJSON({
        file: order1File,
        exchangeRateKeyName: inputKeyName.totalUsd,
      });
      rawJsonOrder1 = [...rawJsonOrder1, ...rawOrder1Data];
    }

    let inputTsvDataArr = [];
    for (const tsvFile of tsvFilesArr) {
      const { shipmentQuantity, inputTsvData } = await getDataTsvFile({
        file: tsvFile,
      });
      totalShipmentQuantity += shipmentQuantity;
      inputTsvDataArr.push(inputTsvData);
    }

    const shipmentFile = files.find(
      (file) => file.fileType == FILE_TYPE.SHIPMENT
    );

    if (!isEmptyValue(shipmentFile)) {
      shipmentData = transformShipmentListInput(
        xlsxToJSON({ file: shipmentFile })
      );
    }

    for (const inputTsvData of inputTsvDataArr) {
      let inputShippingCost = [];
      let skuList = totalSkuList;
      let elementsPrice = [];
      // let shipmentData = [];
      let shipment, originalShipment, shipmentId;

      // const { inputTsvData } = await getDataTsvFile({
      //   file: tsvFile,
      // });
      shipmentId = inputTsvData[0].shipmentId;

      if (!isEmptyValue(shipmentData)) {
        const shipmentObj = shipmentData.find(
          (item) => item?.shipmentId == shipmentId
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

      // for await (const file of files) {
      //   const fileType = getFileType(file);
      //   switch (fileType) {
      //     case FILE_TYPE.ORDER_1: {
      //       const order1Input = transformOrderList1Input(
      //         xlsxToJSON({
      //           file: file,
      //           exchangeRateKeyName: inputKeyName.totalUsd,
      //         }),
      //         shipmentId
      //       );
      //       const {
      //         elementsPriceArr = [],
      //         domesticShippingCostArr = [],
      //         internationalShippingCostArr = [],
      //         packingLabelingCostArr = [],
      //       } = order1Input;
      //       elementsPrice = [
      //         ...elementsPriceArr,
      //         ...elementsPrice,
      //         ...packingLabelingCostArr,
      //       ];
      //       inputShippingCost = [
      //         ...inputShippingCost,
      //         ...domesticShippingCostArr,
      //         ...internationalShippingCostArr,
      //       ];
      //       break;
      //     }
      //     default:
      //   }
      // }

      const totalOrder1Data = transformOrderList1Input(
        rawJsonOrder1,
        shipmentId
      );
      const {
        elementsPriceArr = [],
        domesticShippingCostArr = [],
        internationalShippingCostArr = [],
        packingLabelingCostArr = [],
        inputPrinttingFeeArr = [],
      } = totalOrder1Data;
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

      skuList = mergeArrays(inputTsvData, skuList, inputKeyName.sku).filter(
        (item) => !_.isEmpty(item?.elements)
      );

      skuList = skuList.map((item) => {
        return { ...item, shipmentId, originalShipment: originalShipment };
      });

      const elementsPriceAndPackingFee = [...elementsPrice];

      skuList = calculatePpuPrice(skuList, elementsPriceAndPackingFee);
      skuList = addCustomizeCost(skuList, elementsPriceAndPackingFee);
      skuList = addPackingCost(skuList, elementsPriceAndPackingFee);
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
    console.log(`${now()}: [${err}]`);
    throw new BadRequestError(err.message);
  }
};

const removeSkuKey = (skuList = []) => {
  skuList = removeObjKey(skuList, inputKeyName.elements);
  skuList = removeObjKey(skuList, KEY_PREFERENCES.packing);
  skuList = removeObjKey(skuList, "customizePackage");
  return skuList;
};

// const filterSku = (skuList = []) => {
//   return skuList.filter(item => item?.)
// }
