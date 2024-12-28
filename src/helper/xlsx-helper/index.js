import ExcelJS from "exceljs";
import { INPUT_KEY_NAME } from "../../shared/constant.js";
import { compareStrings } from "../../shared/utils.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

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

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const outputDir = path.join(__dirname, "test");

    // Create the directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    // Get all images in the worksheet
    const images = worksheet.getImages();
    images.forEach((image) => {
      const { imageId, range } = image;
      const imgCol = parseInt(range.tl.col.toFixed());
      console.log(range);

      // Check if the image is in the target column
      if (imgCol === pictureColIndex) {
        const rowIndex = range.tl.row; // Get the row index of the top-left corner
        const workbookImage = workbook.getImage(imageId);

        // Construct the file path
        const fileName = `image_col_${pictureColIndex}_row_${rowIndex}.${workbookImage.extension}`;
        const filePath = path.join(outputDir, fileName);

        // Save the image to the directory
        fs.writeFileSync(filePath, workbookImage.buffer);
        console.log(`Saved image to: ${filePath}`);
      }
    });
    // END EXCEL JS
  };
}
