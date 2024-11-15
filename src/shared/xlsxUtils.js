import ExcelJS from "exceljs";
import { KEY_PREFERENCES } from "./constant.js";

export class XlsxUtils {
  /**
   * @param {ExcelJS.Worksheet} worksheet
   */
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
   * @param {ExcelJS.Worksheet} worksheet
   */
  static checkIfColumnExists(worksheet, keyName) {
    const columnExists = worksheet.columns.some(
      (column) => column.key === keyName
    );
    return columnExists;
  }

  /**
   * @param {ExcelJS.Worksheet} worksheet
   */
  static deleteColumn(worksheet, colIndex) {
    worksheet.spliceColumns(colIndex, 1);
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

  /**
   * @param {ExcelJS.Worksheet} worksheet
   */
  static async clearColumnData(worksheet, columnIndex) {
    worksheet.getColumn(columnIndex).eachCell((cell) => {
      cell.value = null; // Clear value (data)
      cell.style = {}; // Clear style
      cell.numFmt = null; // Clear number format if set
    });
  }

  /**
   * @param {ExcelJS.Worksheet} worksheet
   */
  static changeBgColorColumn(worksheet, colIndex, backgroundColor) {
    const column = worksheet.getColumn(colIndex);
    const colLetter = this.columnIndexToLetter(colIndex);

    if (column) {
      column.eachCell((cell, rowNumber) => {
        if (cell) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: backgroundColor },
            bgColor: { argb: backgroundColor },
          };
        }
      });
    }
    // const cellAddress = "J3";
    // const cell = worksheet.getCell(cellAddress);
    // cell.fill = {
    //   type: "pattern",
    //   pattern: "solid",
    //   fgColor: { argb: "FF00FF00" },
    // };

    // const cell1Address = "H3";
    // const cell1 = worksheet.getCell(cell1Address);
    // cell1.fill = {
    //   type: "pattern",
    //   pattern: "solid",
    //   fgColor: { argb: "FF00FF00" },
    // };
  }

  /**
   * @param {ExcelJS.Worksheet} worksheet
   */
  static changeCellBgColor(worksheet, cellAddress, backgroundColor) {
    const cell = worksheet.getCell(cellAddress);
    if (cell) {
      cell.fill = null;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: backgroundColor },
      };
    }
  }

  /**
   * Clears the fill of an entire column by index.
   * @param {ExcelJS.Worksheet} worksheet
   */
  static clearColumnFill(worksheet, colIndex) {
    const column = worksheet.getColumn(colIndex);
    if (column) {
      column.eachCell((cell) => {
        cell.fill = null; // Clear the fill for each cell in the column
      });
    }
  }

  /**
   * Makes an entire row's font bold in an Excel worksheet.
   * @param {Worksheet} worksheet - The worksheet where the row is located.
   * @param {number} rowNumber - The row number to make bold (1-based index).
   */
  static makeRowBold(worksheet, rowNumber) {
    const row = worksheet.getRow(rowNumber); // Get the row by number

    // Set each cell in the row to bold
    row.eachCell((cell) => {
      cell.font = { ...cell.font, bold: true }; // Keep other font settings and apply bold
    });
  }

  static checkIsPaymentFee = (productName = "") => {
    return (
      productName?.toLowerCase()?.includes(KEY_PREFERENCES.PAYMENT_COST) ||
      productName?.toLowerCase()?.includes(KEY_PREFERENCES.PAYMENT_FEE)
    );
  };

  static getHeaderWidth = (headerText) => {
    return headerText.length + 1;
  }
}
