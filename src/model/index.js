export class InputShippingCost {
  constructor(
    name,
    order,
    shipment,
    shipmentId,
    totalCny,
    totalUsd,
    totalShipmentQuantity,
    weight,
    paymentCostDivisor,
    isDomestic
  ) {
    this.name = name;
    this.order = order;
    this.shipment = shipment;
    this.shipmentId = shipmentId;
    this.totalCny = totalCny;
    this.totalUsd = totalUsd;
    this.totalShipmentQuantity = totalShipmentQuantity;
    this.weight = weight;
    this.paymentCostDivisor = paymentCostDivisor;
    this.isDomestic = isDomestic;
  }

  // Method in the class
  static fromJson(jsonObj) {
    return new InputShippingCost(jsonObj);
  }
}