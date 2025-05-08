import { extractNumberFromFilename } from "../helper/data-input-helper/index.js";
import { Utils, isEmptyValue, removeNewlines } from "../shared/utils.js";
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
    image,
    labelingCostCny,
    labelingCostUsd,
    customizeCostCny,
    customizeCostUsd,
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
    this.isPaymentFee = isPaymentFee;
    this.image = image;
    this.labelingCostCny = labelingCostCny,
    this.labelingCostUsd = labelingCostUsd,
    this.customizeCostCny = customizeCostCny,
    this.customizeCostUsd = customizeCostUsd
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
    image,
    labelingCostCny,
    labelingCostUsd,
    customizeCostCny,
    customizeCostUsd,
  }) {
    if (isNaN(leftQuantity)) {
      leftQuantity = quantity;
    }

    let fileOrder = 0;
    if (fileName) {
      fileOrder = extractNumberFromFilename(fileName);
    }
    if (isEmptyValue(cnyPrice)) {
      cnyPrice = null;
    }
    if (isEmptyValue(usdPrice)) {
      usdPrice = null;
    }
    if (isEmptyValue(exchangeRate)) {
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
      isPaymentFee,
      image,
      labelingCostCny,
      labelingCostUsd,
      customizeCostCny,
      customizeCostUsd,
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
      image: this.image,
      labelingCostCny,
      labelingCostUsd,
      customizeCostCny,
      customizeCostUsd,
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

  getLeftQuantity() {
    return this.leftQuantity;
  }

  getPaymentCostLeftQuantity() {
    return this.paymentCostLeftQuantity;
  }

  getShipmentPaymentLeftQuantity() {
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
        return newLeftQuantity;
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

  getLabelingCostUsd() {
    let labelingCostUsd;
    if (this.labelingCostUsd) {
      labelingCostUsd = this.labelingCostUsd;
    }
    else if(this.labelingCostCny && this.exchangeRate){
      labelingCostUsd = `${this.labelingCostCny} / ${this.exchangeRate}`;
    }
    return labelingCostUsd;
  }

  getUsdFormula() {
    let usdFormula;
    if (!isEmptyValue(this.cnyPrice) && !isEmptyValue(this.exchangeRate)) {
      usdFormula = `${this.cnyPrice} / ${this.exchangeRate}`;
      if(Utils.isValidDecimalPart(this.cnyPrice)){
        return usdFormula;
      }
    }
    if (this.usdPrice) {
      usdFormula = this.usdPrice;
    }
    return usdFormula;
  }

  getCnyFormula() {
    // if (this.cnyPrice) {
    return this.cnyPrice;
    // } else {
    //   return 0;
    // }
  }

  getPaymentCostDivisor() {
    return this.paymentCostDivisor;
  }

  getImage(){
    return this.image;
  }

  getOrder(){
    return this.order;
  }
}
