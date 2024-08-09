import express from "express";
import { calculateGood } from "./src/api/calculate-goods/calculate-good.service.js";

const app = express();
const port = 3000;

calculateGood();

// app.get('/', (req, res) => {
//   res.send('Hello World!');
// });

// app.listen(port, () => {
//   console.log(`Server is running at http://localhost:${port}`);
// });

// import XLSX from 'xlsx';
// import path from 'path';
// import { fileURLToPath } from 'url';

// // Utility to get the directory of the current file
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// /**
//  * Creates a new XLSX file and inserts a sheet with the provided JSON data and formulas.
//  * @param {Array} json - The JSON data to be converted.
//  * @param {string} filePath - The output file path.
//  * @param {string} sheetName - The name of the sheet.
//  */
// const createXlsxWithFormulas = (json, filePath, sheetName = 'Sheet1') => {
//   try {
//     // Create a new workbook
//     const workbook = XLSX.utils.book_new();

//     // Convert JSON to a worksheet
//     const worksheet = XLSX.utils.json_to_sheet(json);
//     worksheet['B4'] = { t: 'n', f: 'B3/(4/2)' };

//     XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

//     XLSX.writeFile(workbook, filePath);

//     console.log(`XLSX file created at ${filePath}`);
//   } catch (err) {
//     console.error('Error creating XLSX file:', err);
//   }
// };

// // Example usage
// const exampleJson = [
//   { name: 'John', value: 10 },
//   { name: 'Jane', value: 20 },
//   { name: 'Doe', value: 30 },
// ];

// // Define the output file path relative to the current directory
// const outputFilePath = path.join(__dirname, 'test-output.xlsx');

// // Create a new XLSX file and insert the sheet with the JSON data
// createXlsxWithFormulas(exampleJson, outputFilePath);
