import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import {
  cashSymbolConst,
  inputKeyName,
  keyPreferences,
  outputColAlphabet,
  outputKeyname,
  outputNumDecimalFormat,
  sampleFolder,
} from "../../shared/constant.js";
import { isEmptyValue } from "../../shared/utils.js";
// import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// exchangeRateKeyName tên cột có công thức chứa tỉ giá

/**
 * Converts an XLSX file to JSON.
 * @param {Multer.File} options.file - The uploaded file object from Multer.
 * @returns {Array}
 */
export const xlsxToJSON = ({
  file,
  sheetIndex = 0,
  exchangeRateKeyName,
  paymentCostKeyName,
  isShippingCost = false, // check xem có phải file order 4 (shipping cost) ko
}) => {
  try {
    // const filePath = path.resolve(
    //   __dirname,
    //   `../../../${sampleFolder}/${fileName}`
    // );

    // if (!fs.existsSync(filePath)) {
    //   return [];
    // }

    // const workbook = XLSX.readFile(filePath);

    const workbook = XLSX.read(file.buffer, { type: "buffer" });

    const sheetName = workbook.SheetNames[sheetIndex];
    const worksheet = workbook.Sheets[sheetName];
    let jsonData = XLSX.utils.sheet_to_json(worksheet);

    addExchangeRateToJson({
      worksheet,
      exchangeRateKeyName,
      jsonData,
    });

    const paymentCostDivisor = getPaymentCostDivisor({
      worksheet,
      paymentCostKeyName,
    });

    if (paymentCostDivisor) {
      jsonData = jsonData.map((item) => {
        return { ...item, paymentCostDivisor };
      });
    }

    if (isShippingCost) {
      getShippingCodeFormulas(worksheet, jsonData);
    }

    jsonData = changeObjKeyName(jsonData);
    console.log("[jsonData]: ", jsonData);

    return jsonData;
  } catch (err) {
    console.log("[ERR CONVERT XLSX --> JSON]:", err);
  }
};

const addExchangeRateToJson = ({
  worksheet,
  exchangeRateKeyName,
  jsonData,
}) => {
  if (!worksheet || !exchangeRateKeyName) {
    return;
  }
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  let columnIndex = -1;
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
    const cell = worksheet[cellAddress];
    if (cell && cell.v === exchangeRateKeyName) {
      columnIndex = C;
      break;
    }
  }

  if (columnIndex === -1) {
    console.error(
      `Key name '${exchangeRateKeyName}' not found in the first row.`
    );
  }

  if (columnIndex >= 0) {
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      // Start from the second row
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: columnIndex });
      const cell = worksheet[cellAddress];

      if (cell && cell.f) {
        const formula = cell.f;

        // định dạng formula "F2/6.759"
        const match = formula.match(/\/(\d+\.\d+)/);
        if (match) {
          const exchangeRate = match[1];
          console.log(`[Exchange Rate]: ${exchangeRate}`);
          if (exchangeRate) {
            jsonData[R - 1].exchangeRate = exchangeRate;
          }
        }
      }
    }
  }
  return;
};

const getPaymentCostDivisor = ({ worksheet, paymentCostKeyName }) => {
  if (!worksheet || !paymentCostKeyName) {
    return;
  }
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  let paymentCostColumnIndex = -1;
  let productNameColumnIndex = -1;

  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
    const cell = worksheet[cellAddress];
    if (cell && cell.v === paymentCostKeyName) {
      paymentCostColumnIndex = C;
    }
    if (cell && cell.v === inputKeyName.productName) {
      productNameColumnIndex = C;
    }
  }

  if (paymentCostColumnIndex === -1) {
    console.error(
      `Key name '${paymentCostKeyName}' not found in the first row.`
    );
  }

  if (productNameColumnIndex === -1) {
    console.error(
      `Key name '${inputKeyName.productName}' not found in the first row.`
    );
  }

  if (paymentCostColumnIndex >= 0) {
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      // Start from the second row
      const productNameCellAddress = XLSX.utils.encode_cell({
        r: R,
        c: productNameColumnIndex,
      });
      const productNameCell = worksheet[productNameCellAddress];

      if (
        productNameCell?.v?.toLowerCase()?.includes(keyPreferences.paymentCost)
      ) {
        const paymentCostCellAddress = XLSX.utils.encode_cell({
          r: R,
          c: paymentCostColumnIndex,
        });
        const paymentCell = worksheet[paymentCostCellAddress];

        if (paymentCell && paymentCell.f) {
          const formula = paymentCell.f;
          // định dạng formula "SUM(E2:E5)/99"
          const paymentCostDivisor = extractDivisor(formula);
          if (paymentCostDivisor) {
            return paymentCostDivisor;
          }
        }
      }
    }
  }
  return;
};

function extractDivisor(formula) {
  const match = formula.match(/\/\s*([\d,\.]+)/);
  return match ? match[1].trim() : null;
}

/**
 * Calculates the total price to make each object.
 * @returns {Array}
 */
const getShippingCodeFormulas = (
  worksheet,
  jsonData,
  shippingCostKeyName = "Price"
) => {
  if (!worksheet || !shippingCostKeyName) {
    return;
  }
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  let columnIndex = -1;
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
    const cell = worksheet[cellAddress];
    if (cell && cell.v === shippingCostKeyName) {
      columnIndex = C;
      break;
    }
  }

  if (columnIndex === -1) {
    console.error(
      `Key name '${shippingCostKeyName}' not found in the first row.`
    );
  }

  if (columnIndex >= 0) {
    for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; ++rowIndex) {
      if (isEmptyValue(jsonData[rowIndex - 1])) {
        return;
      }
      // Start from the second row
      const cellAddress = XLSX.utils.encode_cell({
        r: rowIndex,
        c: columnIndex,
      });
      const cell = worksheet[cellAddress];

      let formula = cell?.v ?? "";
      if (cell && cell.f) {
        formula = cell.f;
        const cellReferenceRegex = /^[A-Z]+\d+\/[A-Z]+\d+$/;
        if (cellReferenceRegex.test(formula)) {
          // Split the formula into the two cell references
          const cellReferences = formula.split("/");
          const firstCell = cellReferences[0];
          const secondCell = cellReferences[1];

          // Get the value of the first cell
          const firstCellValue = worksheet[firstCell].v;
          // Get the value of the second cell
          const secondCellValue = worksheet[secondCell].v;

          formula = `${firstCellValue} / ${secondCellValue}`;
          console.log("Converted formula:", formula);
        } else {
          console.log("[Shipping formula]: ", formula);
        }

        // formulas.push(evalCalculation(formula));
      }
      if (cell?.w?.includes(cashSymbolConst.yuan)) {
        const exchangeRate = jsonData[rowIndex - 1]?.exchangeRate;
        if (exchangeRate) {
          formula = `${formula} / ${exchangeRate}`;
        }
      }
      jsonData[rowIndex - 1].shippingFormula = formula;
    }
  }
};

export const jsonToXlsx = async ({ json = [], sheetName = "Sheet1" }) => {
  try {
    if (json.length === 0) {
      throw new Error("The JSON data is empty.");
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);

    // Add columns based on the JSON keys
    worksheet.columns = Object.keys(json[0]).map((key) => ({
      header: key,
      key: key,
      width: 20,
    }));

    // Add rows from JSON data
    json.forEach((item) => {
      worksheet.addRow(item);
    });

    const firstRowNum = 2;
    let lastRowNum = null;
    worksheet.eachRow((row, rowNumber) => {
      if (row.values.length > 0) {
        lastRowNum = rowNumber;
      }
    });

    // Apply formulas
    addFormulaToWorksheet({
      jsonData: json,
      worksheet,
      firstRowNum,
      lastRowNum,
    });

    // add number format
    addNumberFormatToWorksheet(worksheet);

    // Style cells
    addStyleToWorksheet(worksheet, firstRowNum);

    const xlsxBuffer = await workbook.xlsx.writeBuffer();
    console.log("[Convert json --> buffer success]");
    return xlsxBuffer;

    // Write to file
    const fileName = "test.xlsx";
    const filePath = path.resolve(
      __dirname,
      `../../../${sampleFolder}/${fileName}`
    );

    await workbook.xlsx.writeFile(filePath);

    console.log(`XLSX file created at ${filePath}`);
  } catch (err) {
    console.error("Error creating XLSX file:", err);
    throw err;
  }
};

const setCellFormula = (worksheet, cell, formula) => {
  worksheet.getCell(cell).value = !isEmptyValue(formula) ? { formula } : "";
};

const addFormulaToWorksheet = ({
  jsonData = [],
  worksheet,
  firstRowNum,
  lastRowNum,
}) => {
  jsonData.forEach((item, index) => {
    const rowNumber = index + 2; // Starting from row 2, assuming row 1 has headers

    const cellAddresses = {
      ppu: `${outputColAlphabet.ppu}${rowNumber}`,
      customPackageCost: `${outputColAlphabet.customPackageCost}${rowNumber}`,
      packingLabelingCost: `${outputColAlphabet.packingLabelingCost}${rowNumber}`,
      domesticShippingCost: `${outputColAlphabet.domesticShippingCost}${rowNumber}`,
      internationalShippingCost: `${outputColAlphabet.internationalShippingCost}${rowNumber}`,
      paymentCost: `${outputColAlphabet.paymentCost}${rowNumber}`,
      cogs: `${outputColAlphabet.cogs}${rowNumber}`,
      amount: `${outputColAlphabet.amount}${rowNumber}`,
      totalAmount: `${outputColAlphabet.totalAmount}${firstRowNum}`,
    };

    const formulas = {
      cogs: `SUM(${outputColAlphabet.ppu}${rowNumber}:${outputColAlphabet.paymentCost}${rowNumber})`,
      amount: `${outputColAlphabet.cogs}${rowNumber} * ${outputColAlphabet.quantity}${rowNumber}`,
      totalAmount: `SUM(${outputColAlphabet.amount}${firstRowNum}:${outputColAlphabet.amount}${lastRowNum})`,
      customPackageCost: item[outputKeyname.customPackageCost],
      ppu: item[outputKeyname.ppu],
      packingLabelingCost: item[outputKeyname.packingLabelingCost],
      domesticShippingCost: item[outputKeyname.domesticShippingCost],
      internationalShippingCost: item[outputKeyname.internationalShippingCost],
      paymentCost: item[outputKeyname.paymentCost],
    };

    // Apply formulas to the worksheet
    Object.entries(cellAddresses).forEach(([key, cell]) => {
      setCellFormula(worksheet, cell, formulas[key]);
    });
  });
};

/**
 * @param {ExcelJS.Worksheet} worksheet
 */
const addNumberFormatToWorksheet = (worksheet) => {
  const columnsToFormat = {
    ppu: "4digits",
    customPackageCost: "4digits",
    packingLabelingCost: "4digits",
    domesticShippingCost: "4digits",
    internationalShippingCost: "4digits",
    paymentCost: "4digits",
    cogs: "4digits",
    amount: "2digits",
    totalAmount: "2digits",
  };

  Object.entries(columnsToFormat).forEach(([key, format]) => {
    worksheet.getColumn(outputColAlphabet[key]).numFmt =
      outputNumDecimalFormat[format];
  });
};

const addStyleToWorksheet = (worksheet, firstRowNum) => {
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell, colNumber) => {
      if (rowNumber === firstRowNum) {
        cell.font = { bold: true };
      }

      // Apply red text color to the entire column J (COGS)
      if (colNumber === 10) {
        cell.font = {
          color: { argb: "FF0000" },
          bold: rowNumber == firstRowNum ? true : false,
        };
      }

      const isNumber = typeof cell.value === "number";
      const isFormula =
        cell.value && typeof cell.value === "object" && cell.value.formula;

      if (isNumber || isFormula) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      }
    });
  });
};

const changeObjKeyName = (jsonData = []) => {
  const updatedArray = jsonData.map((obj) => {
    const newObj = {};

    Object.keys(obj).forEach((key) => {
      if (key.toLowerCase().includes("weight")) {
        newObj["weight"] = obj[key]; // Rename the key to 'weight'
      } else if (key.toLowerCase().includes(inputKeyName.productName.toLowerCase())) {
        newObj["productName"] = obj[key]; // Rename keys containing 'name' to 'name'
      } else {
        newObj[key] = obj[key]; // Keep other keys unchanged
      }
    });

    return newObj;
  });
  return updatedArray;
};
