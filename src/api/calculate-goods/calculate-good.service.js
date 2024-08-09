import _ from "lodash";
import {
  addCustomizeCost,
  addPackingCost,
  calculateTotalPrice,
  removeObjKey,
} from "../../helper/calculate-helper/index.js";
import {
  transformCartonFeeInput,
  transformOrderList1Input,
  transformOrderList2Input,
  transformProductListInput,
} from "../../helper/data-input-helper/index.js";
import { readAndTransformTsvFile } from "../../helper/tsv-helper/index.js";
import { jsonToXLSX, xlsxToJSON } from "../../helper/xlsx-helper/index.js";
import { fileTestName, inputKeyName } from "../../shared/constant.js";
import { mergeArrays } from "../../shared/utils.js";

export const calculateGood = async () => {
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
  ).filter((el) => !_.isEmpty(el.elements));

  const inputCartonFee = transformCartonFeeInput(
    xlsxToJSON({
      fileName: fileTestName.orderList3,
      exchangeRateKeyName: inputKeyName.totalUsd,
    })
  );

  const goodsPriceAndPrinttingFee = [...inputGoodsPrice, ...inputPrinttingFee];
  skuList = calculateTotalPrice(skuList, goodsPriceAndPrinttingFee);
  skuList = addCustomizeCost(skuList, goodsPriceAndPrinttingFee);
  skuList = addPackingCost(skuList, inputCartonFee);
  
  skuList = removeObjKey(skuList, inputKeyName.elements);
  skuList = removeObjKey(skuList, "packing");
  skuList = removeObjKey(skuList, "customizePackage");


  jsonToXLSX({ json: skuList });
};
