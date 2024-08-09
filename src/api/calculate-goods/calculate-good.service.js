import _ from "lodash";
import {
  addCogsAndAmount,
  addCustomizeCost,
  addPackingCost,
  addShippingCost,
  calculatePpuPrice,
  removeObjKey
} from "../../helper/calculate-helper/index.js";
import {
  transformCartonFeeInput,
  transformOrderList1Input,
  transformOrderList2Input,
  transformProductListInput,
  transformShippingCostInput,
} from "../../helper/data-input-helper/index.js";
import { readAndTransformTsvFile } from "../../helper/tsv-helper/index.js";
import { jsonToXLSX, xlsxToJSON } from "../../helper/xlsx-helper/index.js";
import { fileTestName, inputKeyName } from "../../shared/constant.js";
import { mergeArrays } from "../../shared/utils.js";

export const calculateGood = async () => {
  const inputShippingCost = transformShippingCostInput(
    xlsxToJSON({
      fileName: fileTestName.orderList4,
      paymentCostKeyName: inputKeyName.totalUsd,
    })
  );

  const inputGoodsPrice = transformOrderList1Input(
    xlsxToJSON({
      fileName: fileTestName.orderList1,
      exchangeRateKeyName: inputKeyName.totalUsd,
    })
  );
  const inputTsvData = await readAndTransformTsvFile({
    fileName: fileTestName.tsvFile,
  });
  const inputProductList = transformProductListInput(
    xlsxToJSON({ fileName: fileTestName.productList })
  );

  const inputPrinttingFee = transformOrderList2Input(
    xlsxToJSON({
      fileName: fileTestName.orderList2,
      exchangeRateKeyName: inputKeyName.totalUsd,
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

  const goodsPriceAndPrinttingFee = [...inputGoodsPrice, ...inputPrinttingFee];

  skuList = calculatePpuPrice(skuList, goodsPriceAndPrinttingFee);
  skuList = addCustomizeCost(skuList, goodsPriceAndPrinttingFee);
  skuList = addPackingCost(skuList, inputCartonFee);
  skuList = addShippingCost(skuList, inputShippingCost);
  skuList = addCogsAndAmount(skuList);

  skuList = removeSkuKey(skuList);

  jsonToXLSX({ json: skuList });
};

const removeSkuKey = (skuList = []) => {
  skuList = removeObjKey(skuList, inputKeyName.elements);
  skuList = removeObjKey(skuList, "packing");
  skuList = removeObjKey(skuList, "customizePackage");
  return skuList;
};
