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
    };
  }
}
