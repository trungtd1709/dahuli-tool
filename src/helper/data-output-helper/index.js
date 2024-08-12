import { inputKeyName, outputKeyname } from "../../shared/constant.js";

export const refactorSkuListFunc = (skuList) => {
  return skuList.map((item) => {
    const {
      SKU,
      quantity,
      shipmentId,
      ppuPrice,
      [inputKeyName.customPackageCost]: customPackageCost,
      [inputKeyName.packingLabeling]: packing,
      domesticShippingCost,
      internationalShippingCost,
      itemPaymentCost,
      cogs,
      amount,
      totalAmount,
      totalQuantity,
    } = item;

    const refactorObj = {
      [outputKeyname.sku]: SKU,
      [outputKeyname.shipmentId]: shipmentId,
      [outputKeyname.quantity]: quantity,
      [outputKeyname.ppu]: ppuPrice,
      [outputKeyname.customPackageCost]: customPackageCost,
      [outputKeyname.packingLabelingCost]: packing,
      [outputKeyname.domesticShippingCost]: domesticShippingCost,
      [outputKeyname.internationalShippingCost]: internationalShippingCost,
      [outputKeyname.paymentCost]: itemPaymentCost,
      [outputKeyname.cogs]: cogs,
      [outputKeyname.totalUnit]: totalQuantity,
      [outputKeyname.amount]: amount,
      [outputKeyname.totalAmount]: totalAmount,
    };
    return refactorObj;
  });
};
