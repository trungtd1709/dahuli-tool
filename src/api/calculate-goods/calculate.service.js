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
  transformCartonFeeInput,
  transformOrderList1Input,
  transformPrinttingFeeInput,
  transformProductListInput,
  transformShipmentListInput,
  transformShippingCostInput,
} from "../../helper/data-input-helper/index.js";
import { refactorSkuListFunc } from "../../helper/data-output-helper/index.js";
import { readAndTransformTsvFile } from "../../helper/tsv-helper/index.js";
import { jsonToXlsx, xlsxToJSON } from "../../helper/xlsx-helper/index.js";
import { inputKeyName, keyPreferences } from "../../shared/constant.js";
import { isEmptyValue, mergeArrays } from "../../shared/utils.js";
import {
  MISSING_SHIPMENT,
  MISSING_SHIPMENT_ID,
  MISSING_SKU_LIST_FILE,
  MISSING_TSV_FILE,
} from "../../shared/err-const.js";

export const calculateGood = async (files = {}) => {
  let {
    order1File,
    printtingFeeFile,
    packingCostFile,
    shippingFile,
    skuListFile,
    tsvFile,
    allShipmentFile,
  } = files;
  tsvFile = tsvFile ? tsvFile[0] : null;
  order1File = order1File ? order1File[0] : null;
  printtingFeeFile = printtingFeeFile ? printtingFeeFile[0] : null;
  packingCostFile = packingCostFile ? packingCostFile[0] : null;
  shippingFile = shippingFile ? shippingFile[0] : null;
  skuListFile = skuListFile ? skuListFile[0] : null;
  allShipmentFile = allShipmentFile ? allShipmentFile[0] : null;

  try {
    if (isEmptyValue(tsvFile)) {
      throw new BadRequestError(MISSING_TSV_FILE);
    }

    let inputTsvData = [];
    inputTsvData = await readAndTransformTsvFile({
      file: tsvFile,
    });
    const shipmentId = inputTsvData[0].shipmentId;

    if (!shipmentId) {
      throw new BadRequestError(MISSING_SHIPMENT_ID);
    }
    let shipmentData = [];

    if (!isEmptyValue(allShipmentFile)) {
      shipmentData = transformShipmentListInput(
        xlsxToJSON({ file: allShipmentFile })
      );
    }

    const shipmentObj = shipmentData.find(
      (item) => item?.shipmentId == shipmentId
    );

    if (isEmptyValue(shipmentObj)) {
      throw new BadRequestError(MISSING_SHIPMENT);
    }

    const { shipment } = shipmentObj;

    if (isEmptyValue(skuListFile)) {
      throw new BadRequestError(MISSING_SKU_LIST_FILE);
    }
    const inputProductList = transformProductListInput(
      xlsxToJSON({ file: skuListFile })
    );

    let order1 = {};
    if (order1File) {
      order1 = transformOrderList1Input(
        xlsxToJSON({
          file: order1File,
          exchangeRateKeyName: inputKeyName.totalUsd,
        }),
        shipmentId
      );
    }

    const {
      elementsPrice = [],
      domesticShippingCostObj,
      internationalShippingCostObj,
      packingLabelingCost,
    } = order1;

    let inputPrinttingFee = [];
    if (printtingFeeFile) {
      inputPrinttingFee = transformPrinttingFeeInput(
        xlsxToJSON({
          file: printtingFeeFile,
          exchangeRateKeyName: inputKeyName.totalUsd,
        })
      );
    }

    let inputShippingCost = [];
    if (shippingFile) {
      inputShippingCost = transformShippingCostInput(
        xlsxToJSON({
          file: shippingFile,
          paymentCostKeyName: inputKeyName.totalUsd,
          exchangeRateKeyName: inputKeyName.totalUsd,
          isShippingCost: true,
        }),
        shipmentId
      );
    }

    if (!isEmptyValue(domesticShippingCostObj)) {
      inputShippingCost.push(domesticShippingCostObj);
    }

    if (!isEmptyValue(internationalShippingCostObj)) {
      inputShippingCost.push(internationalShippingCostObj);
    }

    let skuList = mergeArrays(
      inputTsvData,
      inputProductList,
      inputKeyName.sku
    ).filter((item) => !_.isEmpty(item.elements));

    let inputPackingCost = [];
    if (packingCostFile) {
      inputPackingCost = transformCartonFeeInput(
        xlsxToJSON({
          file: packingCostFile,
          exchangeRateKeyName: inputKeyName.totalUsd,
        })
      );
    }

    const elementsPriceAndPrinttingFee = [
      ...elementsPrice,
      ...inputPrinttingFee,
    ];

    if (packingLabelingCost) {
      skuList = skuList.map((item) => {
        return { ...item, packingLabelingCost };
      });
    }

    if (shipment) {
      skuList = skuList.map((item) => {
        return { ...item };
      });
    }

    skuList = calculatePpuPrice(skuList, elementsPriceAndPrinttingFee);
    skuList = addCustomizeCost(skuList, elementsPriceAndPrinttingFee);
    skuList = addPackingCost(skuList, inputPackingCost);
    skuList = addShippingAndPaymentCost(skuList, inputShippingCost);
    skuList = addCogsAndAmount(skuList);
    skuList = addTotalAmountAndQuantity(skuList);
    skuList = removeSkuKey(skuList);

    const refactorSkuList = refactorSkuListFunc(skuList);
    const xlsxBuffer = await jsonToXlsx({ json: refactorSkuList });
    return { xlsxBuffer, shipment, shipmentId };
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
