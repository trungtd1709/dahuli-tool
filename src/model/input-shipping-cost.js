import { removeNewlines } from "../shared/utils.js";

export class InputShippingCost {
  constructor({
    name,
    order,
    shipment,
    originalShipment,
    shipmentId,
    totalCny,
    totalUsd,
    totalShipmentQuantity,
    weight,
    paymentCostDivisor,
    isDomestic,
    shipmentQuantity,
  }) {
    this.name = name;
    this.order = order;
    this.shipment = shipment;
    this.originalShipment = originalShipment;
    this.shipmentId = shipmentId;
    this.totalCny = totalCny;
    this.totalUsd = totalUsd;
    this.totalShipmentQuantity = totalShipmentQuantity;
    this.weight = weight;
    this.paymentCostDivisor = paymentCostDivisor;
    this.isDomestic = isDomestic;
    this.shipmentQuantity = shipmentQuantity;
  }

  // Method in the class
  static fromJson({
    name,
    order,
    shipment,
    originalShipment,
    shipmentId,
    totalCny,
    totalUsd,
    totalShipmentQuantity,
    weight,
    paymentCostDivisor,
    isDomestic,
    shipmentQuantity,
  }) {
    removeNewlines;
    return new InputShippingCost({
      name: removeNewlines(name),
      order,
      shipment,
      originalShipment,
      shipmentId,
      totalCny,
      totalUsd,
      totalShipmentQuantity,
      weight,
      paymentCostDivisor,
      isDomestic,
      shipmentQuantity,
    });
  }
}
