export class NegativeInStockPlace {
    constructor({
      productName,
      // colLetter,
      // rowNumber,
      leftValue,
      shipment
    }) {
      this.productName = productName;
      // this.colLetter = colLetter;
      // this.rowNumber = rowNumber;
      this.leftValue = leftValue;
      this.shipment = shipment;
    }
  
    // Method in the class
    static fromJson({
      productName,
      // colLetter,
      // rowNumber,
      leftValue,
      shipment
    }) {
      return new NegativeInStockPlace({
        productName,
        // colLetter,
        // rowNumber,
        leftValue,
        shipment
      });
    }
  }
  