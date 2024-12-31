import ExcelJS from "exceljs";
import { INPUT_KEY_NAME, KEY_PREFERENCES } from "../../shared/constant.js";
import { compareStrings } from "../../shared/utils.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { FileImage } from "../../model/file-image.js";
import sharp from "sharp";

export class XlsxHelper {
  /**
   * @param {Express.Multer.File} file - The uploaded file object from Multer.
   * @returns {Array}
   */
  static getImagesFromXlsx = async (
    file,
    pictureKeyName = INPUT_KEY_NAME.PICTURE
  ) => {
    // START EXCEL JS
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer);
    const worksheet = workbook.getWorksheet(1);
    const headers = [];

    let pictureColIndex = null;

    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber] = cell.text.trim();
      const colKeyName = cell?.value;
      if (colKeyName && compareStrings(colKeyName, pictureKeyName)) {
        pictureColIndex = colNumber;
      }
    });

    // Get all images in the worksheet
    const rawImages = worksheet.getImages();
    const images = rawImages.map((image) => {
      const { imageId, range } = image;
      const imgCol = parseInt(range.tl.col.toFixed());

      // Check if the image is in the target column
      if (imgCol == pictureColIndex || imgCol + 1 == pictureColIndex) {
        const rowIndex = parseInt(range.tl.row.toFixed()); // Get the row index of the top-left corner
        const workbookImage = workbook.getImage(imageId);

        const fileImage = FileImage.fromJson({
          buffer: workbookImage.buffer,
          rowIndex,
        });
        return fileImage;
      }
    });
    return images;
    // END EXCEL JS
  };

  /**
   * @param {ExcelJS.Worksheet} worksheet - The worksheet where the row is located.
   * @param {ExcelJS.Workbook} workbook
   * @param {number} rowNumber - The row number to make bold (1-based index).
   */
  static addImagesToExcel = (
    workbook,
    worksheet,
    imageBuffer,
    colIndex,
    rowIndex,
    resizeOptions = { width: 50, height: 50 }
  ) => {
    if (imageBuffer) {
      console.log(Buffer.isBuffer(imageBuffer));

      const imageId = workbook.addImage({
        buffer: imageBuffer,
        extension: "png",
      });

      worksheet.addImage(imageId, {
        tl: { col: colIndex - 1, row: rowIndex - 1 }, // Adjust for 0-based index
        br: { col: colIndex, row: rowIndex }, // Bottom-right corner of the same cell
      });
    }
  };

  /**
   *
   * @param {} worksheet
   */
  static getWorksheetJsonData = async (file) => {
    try {
      // Initialize a workbook
      const workbook = new ExcelJS.Workbook();

      // If Multer stores the file in memory, use buffer
      if (file.buffer) {
        await workbook.xlsx.load(file.buffer);
      } else if (file.path) {
        await workbook.xlsx.readFile(file.path);
      } else {
        throw new Error("Invalid Multer file: no buffer or path found.");
      }

      // Get the first worksheet
      const worksheet = workbook.getWorksheet(1);

      if (!worksheet) {
        throw new Error("No worksheet found in the file.");
      }

      // Parse Excel data into JSON
      const jsonData = [];
      const headers = [];

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          // Extract headers from the first row
          row.eachCell((cell) => {
            headers.push(cell.value);
          });
        } else {
          // Map row data to corresponding headers
          const rowData = {};
          row.eachCell((cell, colNumber) => {
            const header = headers[colNumber - 1];
            if (!header) return; // Skip cells without a corresponding header

            if(header == INPUT_KEY_NAME.PRODUCT_NAME){
              rowData[header] = cell.value;
            }

            if (header == INPUT_KEY_NAME.USD) {
              if (cell.formula) {
                // Regex to find cell addresses in the formula (e.g., A1, B2)
                const cellAddressRegex = /([A-Z]+[0-9]+)/g;

                // Find all cell addresses in the formula
                const formulaWithValues = cell.formula.replace(
                  cellAddressRegex,
                  (match) => {
                    const referencedCell = worksheet.getCell(match); // Get the referenced cell
                    const cellValue = referencedCell.value || 0; // Default to 0 if no value
                    return cellValue; // Replace the cell address with its value
                  }
                );
                rowData[header] = formulaWithValues;
              }
            }
          });
          const checkHeader = headers.find(
            (item) => item == INPUT_KEY_NAME.USD
          );
          if (checkHeader && rowData?.[INPUT_KEY_NAME.USD]) {
            jsonData.push(rowData);
          }
        }
      });

      return jsonData; // Return the parsed JSON
    } catch (error) {
      console.error("Error parsing Excel file:", error.message);
      throw error; // Rethrow the error for the caller to handle
    }
  };
}
