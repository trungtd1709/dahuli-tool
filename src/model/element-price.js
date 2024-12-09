import { extractNumberFromFilename } from "../helper/data-input-helper/index.js";
import { isEmptyValue, removeNewlines } from "../shared/utils.js";
import { XlsxUtils } from "../shared/xlsxUtils.js";

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
    paymentCostDivisor,
    isPaymentFee,
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
    this.paymentCostLeftQuantity = leftQuantity;
    this.shipmentPaymentLeftQuantity = leftQuantity;
    this.domesticShippingCost = domesticShippingCost;
    this.fileOrder = fileOrder;
    this.paymentCostDivisor = paymentCostDivisor;
    this.isPaymentFee = isPaymentFee
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
    paymentCostDivisor,
  }) {
    if (isNaN(leftQuantity)) {
      leftQuantity = quantity;
    }

    let fileOrder = 0;
    if (fileName) {
      fileOrder = extractNumberFromFilename(fileName);
    }
    if(isEmptyValue(cnyPrice)){
      cnyPrice = null;
    }
    if(isEmptyValue(usdPrice)){
      usdPrice = null;
    }
    if(isEmptyValue(exchangeRate)){
      exchangeRate = null;
    }

    let isPaymentFee = XlsxUtils.checkIsPaymentFee(name);
    

    return new ElementPrice({
      name: removeNewlines(name),
      exchangeRate,
      fileName,
      usdPrice,
      cnyPrice,
      order,
      packingLabelingCost,
      quantity,
      leftQuantity,
      paymentCostLeftQuantity: leftQuantity,
      shipmentPaymentLeftQuantity: leftQuantity,
      domesticShippingCost,
      fileOrder,
      paymentCostDivisor,
      isPaymentFee
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
      paymentCostDivisor: this.paymentCostDivisor,
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
    } else {
      return 0;
    }
  }

  getLeftQuantity(){
    return this.leftQuantity;
  }

  getPaymentCostLeftQuantity(){
    return this.paymentCostLeftQuantity;
  }

  getShipmentPaymentLeftQuantity(){
    return this.shipmentPaymentLeftQuantity;
  }

  setPaymentCostLeftQuantity(quantity) {
    if (quantity) {
      let newLeftQuantity = this.paymentCostLeftQuantity - quantity;
      // >= 0 thì xử lý như bình thường
      if (newLeftQuantity >= 0) {
        this.paymentCostLeftQuantity = newLeftQuantity;
        return 0;
      }
      // < 0 thì set leftQuantity = 0 r xử lý tiếp
      else {
        this.paymentCostLeftQuantity = 0;
        return -newLeftQuantity;
      }
    } else {
      return 0;
    }
  }

  setShipmentPaymentLeftQuantity(quantity) {
    if (quantity) {
      let newLeftQuantity = this.shipmentPaymentLeftQuantity - quantity;
      // >= 0 thì xử lý như bình thường
      if (newLeftQuantity >= 0) {
        this.shipmentPaymentLeftQuantity = newLeftQuantity;
        return 0;
      }
      // < 0 thì set leftQuantity = 0 r xử lý tiếp
      else {
        this.shipmentPaymentLeftQuantity = 0;
        return -newLeftQuantity;
      }
    } else {
      return 0;
    }
  }

  getUsdFormula() {
    let usdFormula;
    if (!isEmptyValue(this.cnyPrice) && !isEmptyValue(this.exchangeRate)) {
      usdFormula = `${this.cnyPrice} / ${this.exchangeRate}`;
    } else {
      usdFormula = this.usdPrice;
    }
    return usdFormula;
  }

  getCnyFormula() {
    return this.cnyPrice;
  }

  getPaymentCostDivisor() {
    return this.paymentCostDivisor;
  }
}
