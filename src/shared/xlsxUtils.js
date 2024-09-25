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
}
