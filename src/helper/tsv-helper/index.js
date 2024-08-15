import fs from "fs/promises";
import path from "path";
import Papa from "papaparse";
import { fileURLToPath } from "url";
import { findIndexByFirstElement } from "../../shared/utils.js";
import _ from "lodash";
import { sampleFolder } from "../../shared/constant.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const readAndTransformTsvFile = async ({ file }) => {
  // const filePath = path.resolve(__dirname, `../../../${sampleFolder}/${fileName}`);

  try {
    // Read the file content
    const data = file.buffer.toString('utf8');
    // const data = await fs.readFile(filePath, "utf8");

    // Parse the TSV content using PapaParse
    const parsedData = await new Promise((resolve, reject) => {
      Papa.parse(data, {
        header: false,
        delimiter: "\t",
        complete: (results) => resolve(results.data),
        error: (error) => reject(error),
      });
    });

    const shipmentId = parsedData[0][1];
    const startIndex =
      findIndexByFirstElement({
        array: parsedData,
        searchValue: "Merchant SKU",
      }) + 1;

    // Transform the rest of the data
    const transformedData = parsedData.slice(startIndex).map((row) => ({
      SKU: row[0],
      //   title: row[1],
      //   ASIN: row[2],
      //   FNSKU: row[3],
      quantity: parseInt(row[9]),
      shipmentId: shipmentId,
    }));

    const itemList = filterItemArray(transformedData);
    console.log("[TSV --> JSON SUCCESS]");
    return itemList;
  } catch (err) {
    console.error("Error reading or parsing TSV file:", err);
    throw err;
  }
};

/**
 *
 * @param {Array} array
 * @returns {Array}
 */
const filterItemArray = (array) => {
  return array.filter((item) => !_.isEmpty(item?.SKU));
};
