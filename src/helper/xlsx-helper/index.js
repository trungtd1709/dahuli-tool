import ExcelJS from "exceljs";
import _ from "lodash";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import {
  outputColAlphabet,
  outputKeyname,
  outputNumDecimalFormat,
} from "../../shared/constant.js";
import { evalCalculation, isEmptyValue } from "../../shared/utils.js";
// import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// exchangeRateKeyName tên cột có công thức chứa tỉ giá
export const xlsxToJSON = ({
  sheetIndex = 0,
  fileName,
  exchangeRateKeyName,
  paymentCostKeyName,
  isShippingCost = false, // check xem có phải file order 4 (shipping cost) ko
}) => {
  try {
    const filePath = path.resolve(
      __dirname,
      `../../../sample-file/${fileName}`
    );

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[sheetIndex];
    const worksheet = workbook.Sheets[sheetName];
    let jsonData = XLSX.utils.sheet_to_json(worksheet);

    const exchangeRate = getExchangeRate({ worksheet, exchangeRateKeyName });
    if (exchangeRate) {
      jsonData = jsonData.map((item) => {
        return { ...item, exchangeRate };
      });
    }

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
      const shippingFormulas = getShippingCodeFormulas({ worksheet });
      if (!_.isEmpty(shippingFormulas)) {
        for (const [index, shippingFormula] of shippingFormulas.entries()) {
          jsonData[index].shippingFormula = shippingFormula;
        }
      }
    }

    return jsonData;
  } catch (err) {
    console.log("[ERR CONVERT XLSX --> JSON]:", err);
  }
};

// export const jsonToXLSX = ({ json = [], sheetName = "Sheet1" }) => {
//   try {
//     // Create a new workbook
//     const workbook = XLSX.utils.book_new();
//     const worksheet = XLSX.utils.json_to_sheet(json);

//     json.forEach((item, index) => {
//       const rowNumber = index + 2; // Starting from row 2, assuming row 1 has headers

//       worksheet[`D${rowNumber}`] = { f: item[outputKeyname.ppu] };
//       worksheet[`E${rowNumber}`] = {
//         f: item?.[outputKeyname.customPackageCost],
//       };
//       worksheet[`F${rowNumber}`] = {
//         f: item?.[outputKeyname.packingLabelingCost],
//       };
//       worksheet[`G${rowNumber}`] = {
//         f: item[outputKeyname.domesticShippingCost],
//       };
//       worksheet[`H${rowNumber}`] = {
//         f: item[outputKeyname.internationalShippingCost],
//       };
//       worksheet[`I${rowNumber}`] = { f: item[outputKeyname.paymentCost] };
//       // worksheet[`J${rowNumber}`] = { f: item[outputKeyname.cogs] };
//     });

//     const centerStyle = {
//       alignment: {
//         vertical: "center",
//         horizontal: "center",
//       },
//     };

//     Object.keys(worksheet).forEach((cell) => {
//       if (worksheet[cell] && cell[0] !== "!") {
//         // Ensure it’s not a metadata cell like !ref
//         worksheet[cell].s = centerStyle;
//       }
//     });

//     worksheet["!cols"] = calculateColumnWidths(json);

//     XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

//     const fileName = "test.xlsx";
//     const filePath = path.resolve(
//       __dirname,
//       `../../../sample-file/${fileName}`
//     );
//     XLSX.writeFile(workbook, filePath);

//     console.log(`XLSX file created at ${filePath}`);
//   } catch (err) {
//     console.error("Error creating XLSX file:", err);
//   }
// };

const calculateColumnWidths = (data) => {
  const keys = Object.keys(data[0]);
  return keys.map((key) => {
    const maxLength = Math.max(
      key.length, // Length of the column header
      ...data.map((item) => String(item[key]).length) // Length of the data in each cell
    );
    // return { wch: maxLength + 2 };
    return { wch: 20 };
  });
};

const getExchangeRate = ({ worksheet, exchangeRateKeyName }) => {
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

  const formulas = [];
  if (columnIndex >= 0) {
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      // Start from the second row
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: columnIndex });
      const cell = worksheet[cellAddress];

      if (cell && cell.f) {
        // formulas.push({
        //   cell: cellAddress,
        //   formula: cell.f,
        // });
        const formula = cell.f;

        // định dạng formula "F2/6.759"
        const match = formula.match(/\/(\d+\.\d+)/);
        if (match) {
          const exchangeRate = match[1];
          console.log(`[Exchange Rate]: ${exchangeRate}`);
          if (exchangeRate) {
            return exchangeRate;
          }
        }
      }
    }
  }
  console.log(formulas);
  return;
};

const getPaymentCostDivisor = ({ worksheet, paymentCostKeyName }) => {
  if (!worksheet || !paymentCostKeyName) {
    return;
  }
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  let columnIndex = -1;
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
    const cell = worksheet[cellAddress];
    if (cell && cell.v === paymentCostKeyName) {
      columnIndex = C;
      break;
    }
  }

  if (columnIndex === -1) {
    console.error(
      `Key name '${paymentCostKeyName}' not found in the first row.`
    );
  }

  if (columnIndex >= 0) {
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      // Start from the second row
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: columnIndex });
      const cell = worksheet[cellAddress];
      if (cell && cell.f) {
        const formula = cell.f;
        // định dạng formula "SUM(E2:E5)/99"
        const paymentCostDivisor = extractDivisor(formula);
        if (paymentCostDivisor) {
          return paymentCostDivisor;
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
const getShippingCodeFormulas = ({
  worksheet,
  shippingCostKeyName = "Price",
}) => {
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

  let formulas = [];

  if (columnIndex >= 0) {
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      // Start from the second row
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: columnIndex });
      const cell = worksheet[cellAddress];
      if (cell && cell.f) {
        const formula = cell.f;
        // formulas.push({
        //   cell: cellAddress,
        //   formula: evalCalculation(formula),
        // });
        formulas.push(evalCalculation(formula));
      }
    }
  }
  return formulas;
};

export const jsonToXlsx = async ({ json = [], sheetName = "Sheet1" }) => {
  try {
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

    // Write to file
    const fileName = "test.xlsx";
    const filePath = path.resolve(
      __dirname,
      `../../../sample-file/${fileName}`
    );
    await workbook.xlsx.writeFile(filePath);

    console.log(`XLSX file created at ${filePath}`);
  } catch (err) {
    console.error("Error creating XLSX file:", err);
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

    // cell address
    const ppuCell = `${outputColAlphabet.ppu}${rowNumber}`;
    const customPackageCostCell = `${outputColAlphabet.customPackageCost}${rowNumber}`;
    const packingLabelingCostCell = `${outputColAlphabet.packingLabelingCost}${rowNumber}`;
    const domesticShippingCostCell = `${outputColAlphabet.domesticShippingCost}${rowNumber}`;
    const internationalShippingCostCell = `${outputColAlphabet.internationalShippingCost}${rowNumber}`;
    const paymentCostCell = `${outputColAlphabet.paymentCost}${rowNumber}`;
    const cogsCell = `${outputColAlphabet.cogs}${rowNumber}`;
    const amountCell = `${outputColAlphabet.amount}${rowNumber}`;
    const totalAmountCell = `${outputColAlphabet.totalAmount}${firstRowNum}`;

    // formulas
    const cogsFormula = `SUM(${outputColAlphabet.ppu}${rowNumber}:${outputColAlphabet.paymentCost}${rowNumber})`;
    const amountFormula = `${outputColAlphabet.cogs}${rowNumber} * ${outputColAlphabet.quantity}${rowNumber}`;
    const totalAmountFormula = `SUM(${outputColAlphabet.amount}${firstRowNum}:${outputColAlphabet.amount}${lastRowNum})`;

    const {
      [outputKeyname.customPackageCost]: customPackageFormula,
      [outputKeyname.ppu]: ppuFormula,
      [outputKeyname.packingLabelingCost]: packingFormula,
      [outputKeyname.domesticShippingCost]: domesticShippingFormula,
      [outputKeyname.internationalShippingCost]: internationalShippingFormula,
      [outputKeyname.paymentCost]: paymentCostFormula,
    } = item;

    // add to worksheet
    setCellFormula(worksheet, ppuCell, ppuFormula);
    setCellFormula(worksheet, customPackageCostCell, customPackageFormula);
    setCellFormula(worksheet, packingLabelingCostCell, packingFormula);
    setCellFormula(
      worksheet,
      domesticShippingCostCell,
      domesticShippingFormula
    );
    setCellFormula(
      worksheet,
      internationalShippingCostCell,
      internationalShippingFormula
    );
    setCellFormula(worksheet, paymentCostCell, paymentCostFormula);
    setCellFormula(worksheet, cogsCell, cogsFormula);
    setCellFormula(worksheet, amountCell, amountFormula);
    setCellFormula(worksheet, totalAmountCell, totalAmountFormula);
  });
};

/**
 * @param {ExcelJS.Worksheet} worksheet
 */
const addNumberFormatToWorksheet = (worksheet) => {
  worksheet.getColumn(outputColAlphabet.ppu).numFmt =
    outputNumDecimalFormat["4digits"];
  worksheet.getColumn(outputColAlphabet.customPackageCost).numFmt =
    outputNumDecimalFormat["4digits"];
  worksheet.getColumn(outputColAlphabet.packingLabelingCost).numFmt =
    outputNumDecimalFormat["4digits"];
  worksheet.getColumn(outputColAlphabet.domesticShippingCost).numFmt =
    outputNumDecimalFormat["4digits"];
  worksheet.getColumn(outputColAlphabet.internationalShippingCost).numFmt =
    outputNumDecimalFormat["4digits"];
  worksheet.getColumn(outputColAlphabet.paymentCost).numFmt =
    outputNumDecimalFormat["4digits"];
  worksheet.getColumn(outputColAlphabet.cogs).numFmt =
    outputNumDecimalFormat["4digits"];
  worksheet.getColumn(outputColAlphabet.amount).numFmt =
    outputNumDecimalFormat["2digits"];
  worksheet.getColumn(outputColAlphabet.totalAmount).numFmt =
    outputNumDecimalFormat["2digits"];
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
