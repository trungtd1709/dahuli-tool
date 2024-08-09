import fs from "fs/promises";
import path from "path";
import Papa from "papaparse";
import { fileURLToPath } from "url";
import { findIndexByFirstElement } from "../../shared/utils.js";
import _ from "lodash";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Reads a TSV file and parses its content to JSON.
 * @param {string} filePath - The path to the TSV file.
 * @returns {Promise<Array>} The parsed data as an array of objects.
 */
export const readTsvFile = async ({ fileName }) => {
  const filePath = path.resolve(__dirname, `../../../sample-file/${fileName}`);

  try {
    // Read the file content
    const data = await fs.readFile(filePath, "utf8");

    // Parse the TSV content using PapaParse
    const results = await new Promise((resolve, reject) => {
      Papa.parse(data, {
        header: true,
        delimiter: "\t",
        complete: (parsedData) => {
          resolve(parsedData.data);
        },
        error: (error) => {
          reject(error);
        },
      });
    });

    // console.log(results[0]);
    // console.log(results[1]);
    // console.log(results[2]);
    // console.log(results[3]);
    // console.log(results[4]);
    // console.log(results[5]);
    // console.log(results[6]);
    // console.log(results[7]);
    return results;
  } catch (err) {
    console.error("Error reading or parsing TSV file:", err);
    throw err;
  }
};

export const readAndTransformTsvFile = async ({ fileName }) => {
  const filePath = path.resolve(__dirname, `../../../sample-file/${fileName}`);

  try {
    // Read the file content
    const data = await fs.readFile(filePath, "utf8");

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
    console.log(parsedData);

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
