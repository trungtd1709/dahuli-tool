import _ from "lodash";
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
  transformOrderList2Input,
  transformProductListInput,
  transformShippingCostInput,
} from "../../helper/data-input-helper/index.js";
import { refactorSkuListFunc } from "../../helper/data-output-helper/index.js";
import { readAndTransformTsvFile } from "../../helper/tsv-helper/index.js";
import { jsonToXlsx, xlsxToJSON } from "../../helper/xlsx-helper/index.js";
import { fileTestName, inputKeyName } from "../../shared/constant.js";
import { isEmptyValue, mergeArrays } from "../../shared/utils.js";

export const calculateGood = async (files = {}) => {
  try {
    const inputTsvData = await readAndTransformTsvFile({
      fileName: fileTestName.tsvFile,
    });

    const inputProductList = transformProductListInput(
      xlsxToJSON({ fileName: fileTestName.productList })
    );

    const shipmentId = inputTsvData[0].shipmentId;

    const order1 = transformOrderList1Input(
      xlsxToJSON({
        fileName: fileTestName.orderList1,
        exchangeRateKeyName: inputKeyName.totalUsd,
      }),
      shipmentId
    );
    const {
      elementsPrice = [],
      domesticShippingCostObj,
      packingLabelingCost,
    } = order1;

    // const inputPrinttingFee = [];

    // let inputShippingCost = transformShippingCostInput(
    //   xlsxToJSON({
    //     fileName: fileTestName.orderList2,
    //     isShippingCost: true,
    //     exchangeRateKeyName: inputKeyName.totalUsd,
    //   }),
    //   shipmentId
    // );

    const inputPrinttingFee = transformOrderList2Input(
      xlsxToJSON({
        fileName: fileTestName.orderList2,
        exchangeRateKeyName: inputKeyName.totalUsd,
      })
    );

    let inputShippingCost = transformShippingCostInput(
      xlsxToJSON({
        fileName: fileTestName.orderList4,
        paymentCostKeyName: inputKeyName.totalUsd,
        isShippingCost: true,
      }),
      shipmentId
    );

    if (!isEmptyValue(domesticShippingCostObj)) {
      inputShippingCost.push(domesticShippingCostObj);
    }

    let skuList = mergeArrays(
      inputTsvData,
      inputProductList,
      inputKeyName.sku
    ).filter((item) => !_.isEmpty(item.elements));

    const inputPackingCost = transformCartonFeeInput(
      xlsxToJSON({
        fileName: fileTestName.orderList3,
        exchangeRateKeyName: inputKeyName.totalUsd,
      })
    );

    const elementsPriceAndPrinttingFee = [
      ...elementsPrice,
      ...inputPrinttingFee,
    ];

    if (packingLabelingCost) {
      skuList = skuList.map((item) => {
        return { ...item, packingLabelingCost };
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
    jsonToXlsx({ json: refactorSkuList });
  } catch (err) {
    console.log(err);
  }
};

const removeSkuKey = (skuList = []) => {
  skuList = removeObjKey(skuList, inputKeyName.elements);
  skuList = removeObjKey(skuList, "packing");
  skuList = removeObjKey(skuList, "customizePackage");
  return skuList;
};

export const testService = () => {
  return { result: "success" };
};
