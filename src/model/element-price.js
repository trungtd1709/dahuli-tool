import { extractNumberFromFilename } from "../helper/data-input-helper/index.js";
import { isEmptyValue } from "../shared/utils.js";

export class ElementPrice {
  constructor({
    // Domestic shipping cost,
    name,
    exchangeRate,
    fileName,
    usdPrice,
    cnyPrice,
    order,
    packingLabelingCost,
    quantity,
    leftQuantity,
    domesticShippingCost,
    fileOrder,
  }) {
    this.name = name;
    this.exchangeRate = exchangeRate;
    this.order = order;
    this.fileName = fileName;
    this.packingLabelingCost = packingLabelingCost;
    this.usdPrice = usdPrice;
    this.cnyPrice = cnyPrice;
    this.quantity = quantity;
    this.leftQuantity = leftQuantity;
    this.domesticShippingCost = domesticShippingCost;
    this.fileOrder = fileOrder;
  }

  // Method in the class
  static fromJson({
    name,
    exchangeRate,
    fileName,
    usdPrice,
    cnyPrice,
    order,
    packingLabelingCost,
    quantity,
    leftQuantity,
    domesticShippingCost,
  }) {
    if (!leftQuantity) {
      leftQuantity = quantity;
    }

    let fileOrder = 0;
    if (fileName) {
      fileOrder = extractNumberFromFilename(fileName);
    }

    return new ElementPrice({
      name,
      exchangeRate,
      fileName,
      usdPrice,
      cnyPrice,
      order,
      packingLabelingCost,
      quantity,
      leftQuantity,
      domesticShippingCost,
      fileOrder,
    });
  }

  static toJson() {
    return {
      name: this.name,
      exchangeRate: this.exchangeRate,
      fileName: this.fileName,
      usdPrice: this.usdPrice,
      cnyPrice: this.cnyPrice,
      order: this.order,
      packingLabelingCost: this.packingLabelingCost,
      quantity: this.quantity,
      leftQuantity: this.leftQuantity,
      domesticShippingCost: this.domesticShippingCost,
      fileOrder: this.fileOrder,
    };
  }

  // quantity mới của đơn hàng
  setLeftQuantity(quantity) {
    if (quantity) {
      let newLeftQuantity = this.leftQuantity - quantity;
      // >= 0 thì xử lý như bình thường
      if (newLeftQuantity >= 0) {
        this.leftQuantity = newLeftQuantity;
        return 0;
      }
      // < 0 thì set leftQuantity = 0 r xử lý tiếp
      else {
        this.leftQuantity = 0;
        return -newLeftQuantity;
      }
    }
  }

  getUsdFormula() {
    let usdFormula;
    if (!isEmptyValue(this.cnyPrice) || !isEmpty(this.exchangeRate)) {
       usdFormula = `${this.cnyPrice} / ${this.exchangeRate}`;
    }
    else{
      usdFormula = this.usdPrice;
    }
    return usdFormula;
  }
}
