import ExcelJS from "exceljs";

export class xlsxUtils {
  static findColumnIndexByKeyName = (worksheet, keyName) => {
    let columnIndex = null;

    // Assume the header is in the first row
    const headerRow = worksheet.getRow(1);

    // Iterate through each cell in the header row
    headerRow.eachCell((cell, colNumber) => {
      if (cell.value && cell.value.toString().trim() === keyName) {
        columnIndex = colNumber;
      }
    });

    // If the column was not found, throw an error or return null
    if (columnIndex === null) {
      throw new Error(`Column with header "${keyName}" not found.`);
    }

    return columnIndex;
  };

  /**
   * Converts an XLSX file to JSON.
   * @param {ExcelJS.Worksheet} worksheet
   */
  static checkIfColumnExists(worksheet, keyName) {
    const columnExists = worksheet.columns.some(
      (column) => column.key === keyName
    );
    return columnExists;
  }

  static columnIndexToLetter(columnIndex) {
    let columnLetter = "";
    let tempIndex = columnIndex;
  
    while (tempIndex > 0) {
      let remainder = (tempIndex - 1) % 26;
      columnLetter = String.fromCharCode(remainder + 65) + columnLetter;
      tempIndex = Math.floor((tempIndex - 1) / 26);
    }
  
    return columnLetter;
  }
}
