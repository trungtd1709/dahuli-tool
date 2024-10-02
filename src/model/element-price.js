export class ElementPrice {
  constructor({
    // Domestic shipping cost,
    name,
    exchangeRate,
    fileName,
    price,
    order,
    packingLabelingCost,
    quantity,
  }) {
    this.name = name;
    this.exchangeRate = exchangeRate;
    this.order = order;
    this.fileName = fileName;
    this.packingLabelingCost = packingLabelingCost;
    this.price = price;
    this.quantity = quantity;
  }

  // Method in the class
  static fromJson({
    name,
    exchangeRate,
    fileName,
    price,
    order,
    packingLabelingCost,
    quantity,
  }) {
    return new ElementPrice({
      name,
      exchangeRate,
      fileName,
      price,
      order,
      packingLabelingCost,
      quantity,
    });
  }
}
