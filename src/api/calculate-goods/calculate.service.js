import _ from "lodash";
import {
  addCogsAndAmount,
  addCustomizeCost,
  addPackingCost,
  addShippingCost,
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
import { mergeArrays } from "../../shared/utils.js";

export const calculateGood = async () => {
  try {
    const order1 = transformOrderList1Input(
      xlsxToJSON({
        fileName: fileTestName.orderList1,
        exchangeRateKeyName: inputKeyName.totalUsd,
      })
    );
    const { inputGoodsPrice = [] } = order1;

    const inputTsvData = await readAndTransformTsvFile({
      fileName: fileTestName.tsvFile,
    });

    const inputProductList = transformProductListInput(
      xlsxToJSON({ fileName: fileTestName.productList })``
    );

    const inputPrinttingFee = transformOrderList2Input(
      xlsxToJSON({
        fileName: fileTestName.orderList2,
        exchangeRateKeyName: inputKeyName.totalUsd,
      })
    );

    const inputShippingCost = transformShippingCostInput(
      xlsxToJSON({
        fileName: fileTestName.orderList4,
        paymentCostKeyName: inputKeyName.totalUsd,
        isShippingCost: true,
      })
    );

    let skuList = mergeArrays(
      inputTsvData,
      inputProductList,
      inputKeyName.sku
    ).filter((item) => !_.isEmpty(item.elements));

    const inputCartonFee = transformCartonFeeInput(
      xlsxToJSON({
        fileName: fileTestName.orderList3,
        exchangeRateKeyName: inputKeyName.totalUsd,
      })
    );

    const goodsPriceAndPrinttingFee = [
      ...inputGoodsPrice,
      ...inputPrinttingFee,
    ];

    skuList = calculatePpuPrice(skuList, goodsPriceAndPrinttingFee);
    skuList = addCustomizeCost(skuList, goodsPriceAndPrinttingFee);
    skuList = addPackingCost(skuList, inputCartonFee);
    skuList = addShippingCost(skuList, inputShippingCost);
    skuList = addCogsAndAmount(skuList);

    skuList = addTotalAmountAndQuantity(skuList);
    skuList = removeSkuKey(skuList);

    const refactorSkuList = refactorSkuListFunc(skuList);

    // jsonToXLSX({ json: refactorSkuList });
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
