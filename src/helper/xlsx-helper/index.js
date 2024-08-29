import ExcelJS from "exceljs";
import XLSX from "xlsx";
import { BadRequestError } from "../../error/bad-request-err.js";
import {
  CHECK_KEYWORD,
  FILE_TYPE,
  KEY_PREFERENCES,
  OUTPUT_COL_ALPHABET,
  OUTPUT_KEY_NAME,
  SHIPMENT_OUTPUT_COL_ALPHABET,
  SHIPMENT_OUTPUT_KEY_NAME,
  cashSymbolConst,
  inputKeyName,
  outputNumDecimalFormat,
} from "../../shared/constant.js";
import { isEmptyValue, now } from "../../shared/utils.js";

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
  isShippingFile = false, // check xem có phải file order 4 (shipping cost) ko
}) => {
  try {
    console.log(`${now()}: [CONVERTING ${file.originalname}`);
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

    if (isShippingFile) {
      getShippingCostFormulas(worksheet, jsonData);
    }

    jsonData = changeObjKeyName(jsonData);

    return jsonData;
  } catch (err) {
    throw new BadRequestError(
      `[Err when convert ${file.originalname}]: ${err.message}`
    );
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
        productNameCell?.v?.toLowerCase()?.includes(KEY_PREFERENCES.paymentCost)
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
const getShippingCostFormulas = (
  worksheet,
  jsonData,
  shippingCostKeyName = "Price"
) => {
  if (!worksheet || !shippingCostKeyName) {
    return;
  }
  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  let priceColIndex = -1,
    weightColIndex = -1,
    totalCnyColIndex = -1;
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
    const cell = worksheet[cellAddress];
    if (cell?.v === shippingCostKeyName) {
      priceColIndex = C;
      // break;
    }
    if (cell?.v?.toLowerCase()?.includes(CHECK_KEYWORD.WEIGHT)) {
      weightColIndex = C;
      // break;
    }
    if (cell?.v?.toLowerCase()?.includes(CHECK_KEYWORD.TOTAL_CNY)) {
      totalCnyColIndex = C;
      // break;
    }
  }

  if (priceColIndex === -1) {
    console.error(
      `Key name '${shippingCostKeyName}' not found in the first row.`
    );
  }

  if (priceColIndex >= 0) {
    for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; ++rowIndex) {
      if (isEmptyValue(jsonData[rowIndex - 1])) {
        return;
      }
      const exchangeRate = jsonData[rowIndex - 1]?.exchangeRate;

      // Start from the second row
      const cellAddress = XLSX.utils.encode_cell({
        r: rowIndex,
        c: priceColIndex,
      });
      const cell = worksheet[cellAddress];

      let priceFormula = cell?.v ?? "";
      if (cell?.v) {
        priceFormula = cell.v;
      }
      if (cell?.f) {
        priceFormula = cell.f;
        const cellReferenceRegex = /^[A-Z]+\d+\/[A-Z]+\d+$/;
        if (cellReferenceRegex.test(priceFormula)) {
          // Split the formula into the two cell references
          const cellReferences = priceFormula.split("/");
          const firstCell = cellReferences[0];
          const secondCell = cellReferences[1];

          const firstCellValue = worksheet[firstCell].v;
          const secondCellValue = worksheet[secondCell].v;

          priceFormula = `${firstCellValue} / ${secondCellValue}`;
          // console.log("Converted formula:", formula);
        }
        // formulas.push(evalCalculation(formula));
      }
      if (isEmptyValue(cell?.f) && isEmptyValue(cell?.v)) {
        const weightCellAddress = XLSX.utils.encode_cell({
          r: rowIndex,
          c: weightColIndex,
        });
        const totalCnyCellAddress = XLSX.utils.encode_cell({
          r: rowIndex,
          c: totalCnyColIndex,
        });

        const weightCell = worksheet[weightCellAddress];
        const totalCnyCell = worksheet[totalCnyCellAddress];

        const weight = weightCell?.v;
        const totalCny = totalCnyCell?.f ?? totalCnyCell?.v;
        // const multipleWeighString = `*${weight}`;
        const multipleWeightStringPattern = new RegExp(`\\*\\s*${weight}`); // Matches "*" followed by any whitespace and then weight
        if (weight && totalCny && multipleWeightStringPattern.test(totalCny)) {
          priceFormula = totalCny.replace(multipleWeightStringPattern, "");
          priceFormula = `${priceFormula} / ${exchangeRate}`;
        } else {
          priceFormula = `${totalCny} / ${weight} / ${exchangeRate}`;
        }
      }

      if (cell?.w?.includes(cashSymbolConst.yuan)) {
        if (exchangeRate) {
          priceFormula = `${priceFormula} / ${exchangeRate}`;
        }
      }

      // check xem có / exchange rate ko, để xem là USD hay tệ
      if (priceFormula?.includes(exchangeRate)) {
        const priceShippingFormulaYuan = priceFormula.replace(
          new RegExp(`/\\s*${exchangeRate}`),
          ""
        );
        jsonData[rowIndex - 1].priceShippingFormulaYuan =
          priceShippingFormulaYuan;
      }
      jsonData[rowIndex - 1].priceShippingFormulaUsd = priceFormula;
    }
  }
};

export const cogsJsonToXlsx = async ({ json = [], sheetName = "Sheet1" }) => {
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
    addNumberFormatToWorksheet(worksheet);
    addStyleToWorksheet(worksheet, firstRowNum);

    const xlsxBuffer = await workbook.xlsx.writeBuffer();
    console.log(`${now()}: [JSON --> BUFFER SUCCESS]`);
    return xlsxBuffer;
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
      ppu: `${OUTPUT_COL_ALPHABET.PPU}${rowNumber}`,
      customPackageCost: `${OUTPUT_COL_ALPHABET.CUSTOM_PACKAGE_COST}${rowNumber}`,
      packingLabelingCost: `${OUTPUT_COL_ALPHABET.PACKING_LABELING_COST}${rowNumber}`,
      domesticShippingCost: `${OUTPUT_COL_ALPHABET.DOMESTIC_SHIPPING_COST}${rowNumber}`,
      internationalShippingCost: `${OUTPUT_COL_ALPHABET.INTERNATIONAL_SHIPPING_COST}${rowNumber}`,
      paymentCost: `${OUTPUT_COL_ALPHABET.PAYMENT_COST}${rowNumber}`,
      cogs: `${OUTPUT_COL_ALPHABET.COGS}${rowNumber}`,
      amount: `${OUTPUT_COL_ALPHABET.AMOUNT}${rowNumber}`,
      totalAmount: `${OUTPUT_COL_ALPHABET.TOTAL_AMOUNT}${firstRowNum}`,
    };

    const formulas = {
      cogs: `SUM(${OUTPUT_COL_ALPHABET.PPU}${rowNumber}:${OUTPUT_COL_ALPHABET.PAYMENT_COST}${rowNumber})`,
      amount: `${OUTPUT_COL_ALPHABET.COGS}${rowNumber} * ${OUTPUT_COL_ALPHABET.QUANTITY}${rowNumber}`,
      totalAmount: `SUM(${OUTPUT_COL_ALPHABET.AMOUNT}${firstRowNum}:${OUTPUT_COL_ALPHABET.AMOUNT}${lastRowNum})`,
      customPackageCost: item[OUTPUT_KEY_NAME.CUSTOM_PACKAGE_COST],
      ppu: item[OUTPUT_KEY_NAME.PPU],
      packingLabelingCost: item[OUTPUT_KEY_NAME.PACKING_LABELING_COST],
      domesticShippingCost: item[OUTPUT_KEY_NAME.DOMESTIC_SHIPPING_COST],
      internationalShippingCost:
        item[OUTPUT_KEY_NAME.INTERNATIONAL_SHIPPING_COST],
      paymentCost: item[OUTPUT_KEY_NAME.PAYMENT_COST],
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
    PPU: "4digits",
    CUSTOM_PACKAGE_COST: "4digits",
    PACKING_LABELING_COST: "4digits",
    DOMESTIC_SHIPPING_COST: "4digits",
    INTERNATIONAL_SHIPPING_COST: "4digits",
    PAYMENT_COST: "4digits",
    COGS: "4digits",
    AMOUNT: "2digits",
    TOTAL_AMOUNT: "2digits",
  };

  Object.entries(columnsToFormat).forEach(([key, format]) => {
    worksheet.getColumn(OUTPUT_COL_ALPHABET[key]).numFmt =
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
      } else if (
        key.toLowerCase().includes(inputKeyName.productName.toLowerCase())
      ) {
        newObj["productName"] = obj[key]; // Rename keys containing 'name' to 'name'
      } else if (key.toLowerCase().includes("qty")) {
        newObj["quantity"] = obj[key];
      } else {
        newObj[key] = obj[key]; // Keep other keys unchanged
      }
    });

    return newObj;
  });
  return updatedArray;
};

/**
 * @param {Express.Multer.File} file
 * @returns {Array}
 */
export const getFileType = (file) => {
  if (file.originalname.includes(CHECK_KEYWORD.TSV)) {
    return FILE_TYPE.TSV;
  }

  const workbook = XLSX.read(file.buffer, { type: "buffer" });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const headers = [];
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const firstRow = range.s.r; // First row number

  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: firstRow, c: col });
    const cell = sheet[cellAddress];
    const header = cell?.v?.toLowerCase()
      ? cell.v.toLowerCase()
      : `UNKNOWN ${col}`;

    headers.push(header);
  }

  if (
    headers.find((item) => item.includes(CHECK_KEYWORD.WEIGHT)) &&
    headers.find((item) => item.includes(CHECK_KEYWORD.PRICE))
  ) {
    return FILE_TYPE.SHIPPING;
  }

  if (headers.find((item) => item.includes(CHECK_KEYWORD.PPU_ELEMENTS))) {
    return FILE_TYPE.SKU_LIST;
  }

  if (
    headers.find((item) => item.includes(CHECK_KEYWORD.SHIPMENT_ID)) &&
    headers.find((item) => item.includes(CHECK_KEYWORD.SHIPMENT))
  ) {
    return FILE_TYPE.SHIPMENT;
  }

  return FILE_TYPE.ORDER_1;
};

export async function createShipmentExcelBuffer(jsonData = []) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sheet 1");

  const columns = Object.keys(jsonData[0]).map((key) => ({
    header: key,
    key,
    width: 20,
  }));
  worksheet.columns = columns;

  jsonData.forEach((item) => worksheet.addRow(item));
  worksheet.addRow({ [SHIPMENT_OUTPUT_KEY_NAME.PRODUCT_NAME]: "TOTAL" });
  jsonData.forEach((item, index) => {
    const rowNumber = index + 2;

    // const { totalUsd, totalCny } = item;
    const totalUsdFormula = item[SHIPMENT_OUTPUT_KEY_NAME.TOTAL_USD];
    const totalCnyFormula = item[SHIPMENT_OUTPUT_KEY_NAME.TOTAL_CNY];
    const cnyPriceFormula = item[SHIPMENT_OUTPUT_KEY_NAME.CNY_PRICE];
    const usdPriceFormula = item[SHIPMENT_OUTPUT_KEY_NAME.USD_PRICE];

    const totalUsdCellAdd = `${SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_USD}${rowNumber}`;
    const totalCnyCellAdd = `${SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_CNY}${rowNumber}`;
    const cnyPriceCellAdd = `${SHIPMENT_OUTPUT_COL_ALPHABET.CNY_PRICE}${rowNumber}`;
    const usdPriceCellAdd = `${SHIPMENT_OUTPUT_COL_ALPHABET.USD_PRICE}${rowNumber}`;

    setCellFormula(worksheet, totalCnyCellAdd, totalCnyFormula);
    setCellFormula(worksheet, totalUsdCellAdd, totalUsdFormula);
    setCellFormula(worksheet, cnyPriceCellAdd, cnyPriceFormula);
    setCellFormula(worksheet, usdPriceCellAdd, usdPriceFormula);
  });

  const lastRowIndex = jsonData.length + 1;
  const sumQuantityFormula = `SUM(${
    SHIPMENT_OUTPUT_COL_ALPHABET.QUANTITY
  }${2}:${SHIPMENT_OUTPUT_COL_ALPHABET.QUANTITY}${lastRowIndex})`;
  const sumTotalCnyFormula = `SUM(${
    SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_CNY
  }${2}:${SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_CNY}${lastRowIndex})`;
  const sumTotalUsdFormula = `SUM(${
    SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_USD
  }${2}:${SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_USD}${lastRowIndex})`;

  const totalRowIndex = lastRowIndex + 1;
  const totalQuantityCellAdd = `${SHIPMENT_OUTPUT_COL_ALPHABET.QUANTITY}${totalRowIndex}`;
  const totalTotalCnyCellAdd = `${SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_CNY}${totalRowIndex}`;
  const totalTotalUsdCellAdd = `${SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_USD}${totalRowIndex}`;

  setCellFormula(worksheet, totalQuantityCellAdd, sumQuantityFormula);
  setCellFormula(worksheet, totalTotalCnyCellAdd, sumTotalCnyFormula);
  setCellFormula(worksheet, totalTotalUsdCellAdd, sumTotalUsdFormula);

  addStyleToShipment(worksheet);
  addNumberFormatToShipment(worksheet);

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

const addStyleToShipment = (worksheet, firstRowNum = 2) => {
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell, colNumber) => {
      if (rowNumber == 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF00FF00" },
        };
        cell.font = { bold: true };
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

/**
 * @param {ExcelJS.Worksheet} worksheet
 */
const addNumberFormatToShipment = (worksheet) => {
  const columnsToFormat = {
    CNY_PRICE: "4digits",
    USD_PRICE: "4digits",
    TOTAL_CNY: "4digits",
    TOTAL_USD: "4digits",
  };

  Object.entries(columnsToFormat).forEach(([key, format]) => {
    worksheet.getColumn(SHIPMENT_OUTPUT_COL_ALPHABET[key]).numFmt =
      outputNumDecimalFormat[format];
  });
};

async function readExcelToRawJson(file) {
  // Create a new workbook
  const workbook = new ExcelJS.Workbook();

  // Read the uploaded file buffer
  await workbook.xlsx.load(file.buffer);

  // Get the first worksheet
  const worksheet = workbook.getWorksheet(1);

  // Initialize an array to hold the data
  const jsonArray = [];

  // Get the headers from the first row
  const headers = [];
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = cell.text.trim();
  });

  // Iterate over all the rows (starting from the second row)
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // skip header row

    const rowData = {};
    row.eachCell((cell, colNumber) => {
      rowData[headers[colNumber]] = cell.value;
    });

    jsonArray.push(rowData);
  });

  worksheet.eachRow((row, rowNumber) => {
    // Add data to new columns (e.g., Column D)
    // This example adds two new columns after the existing columns
    row.getCell(row.cellCount + 1).value = `New Col 1 Row ${rowNumber}`;
    row.getCell(row.cellCount + 2).value = `New Col 2 Row ${rowNumber}`;
  });

  // return jsonArray;
}

export async function modifyExcelFile(file, shipmentObjAddToOrder = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer);
  const worksheet = workbook.getWorksheet(1);

  let productNameColumnIndex = null;
  let quantityColumnIndex = null;
  let quantityColumnLetter = null;

  let totalUsdColumnIndex = null;
  let totalUsdColumnLetter = null;

  let lastRowIndex;
  const firstRowIndex = "2";

  const headerRow = worksheet.getRow(1);

  const headers = [];
  const jsonData = [];
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber] = cell.text.trim();
    if (
      cell.value &&
      cell.value.toString().trim().toLowerCase() ===
        inputKeyName.productName.toLowerCase()
    ) {
      productNameColumnIndex = colNumber;
    }

    if (
      cell.value &&
      cell.value
        .toString()
        .trim()
        .toLowerCase()
        .includes(KEY_PREFERENCES.QTY.toLowerCase())
    ) {
      quantityColumnIndex = colNumber;
      quantityColumnLetter = columnIndexToLetter(quantityColumnIndex);
    }

    if (cell.value && cell.value.toString().trim() == inputKeyName.totalUsd) {
      totalUsdColumnIndex = colNumber;
      totalUsdColumnLetter = columnIndexToLetter(totalUsdColumnIndex);
    }
  });

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header row

    const rowData = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      rowData[headers[colNumber]] = cell.value;
    });
    jsonData.push(rowData);

    lastRowIndex = rowNumber;
  });

  const shipmentKeys = Object.keys(shipmentObjAddToOrder).sort() ?? [];

  const shipmentStartColIndex = headerRow.cellCount + 1;
  const shipmentLastColIndex = headerRow.cellCount + shipmentKeys.length;
  const inStockColIndex = shipmentLastColIndex + 1;

  shipmentKeys.forEach((shipmentKey, index) => {
    const newColIndex = headerRow.cellCount + 1;
    headerRow.getCell(newColIndex).value = shipmentKey;

    // Add data for each row under the new column
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row

      const rowProductName = row
        .getCell(productNameColumnIndex)
        .value.toLowerCase();
      const shipmentDatas = shipmentObjAddToOrder[shipmentKey] ?? [];

      const productObj = shipmentDatas.find((shipmentData) => {
        return shipmentData?.name?.toLowerCase() == rowProductName;
      });

      if (!isEmptyValue(productObj)) {
        row.getCell(newColIndex).value = productObj?.quantity;
      }
    });
  });

  const shipmentStartColLetter = columnIndexToLetter(shipmentStartColIndex);
  const shipmentLastColLetter = columnIndexToLetter(shipmentLastColIndex);

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const formula = `${quantityColumnLetter}${rowNumber} - SUM(${shipmentStartColLetter}${rowNumber}:${shipmentLastColLetter}${rowNumber})`;
    const cell = row.getCell(inStockColIndex);

    if (cell) {
      cell.value = { formula };
    }
  });
  headerRow.getCell(inStockColIndex).value = "In stock";

  for (let i = shipmentStartColIndex; i <= inStockColIndex; i++) {
    const shipmentColLetter = columnIndexToLetter(i);
    const shipmentTotalCellAddress = `${shipmentColLetter}${lastRowIndex}`;
    const totalFormula = `SUM(${shipmentColLetter}${firstRowIndex}:${shipmentColLetter}${
      lastRowIndex - 1
    })`;
    setCellFormula(worksheet, shipmentTotalCellAddress, totalFormula);
  }

  // const costShipmentStartIndex = headerRow.cellCount + 2;
  // const costShipmentLastColIndex =
  //   headerRow.cellCount + 1 + shipmentKeys.length;

  shipmentKeys.forEach((shipmentKey, index) => {
    const newColIndex = headerRow.cellCount + 1;
    headerRow.getCell(newColIndex).value = `Cost ${shipmentKey}`;

    // Add data for each row under the new column
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;

      const shipmentQuantityColLetter = findColumnIndexByKeyName(
        worksheet,
        shipmentKey
      );
      const totalShipmentQuantityColLetter = `${quantityColumnLetter}${rowNumber}`;

      const totalShipmentQuantityCellAddress = `${totalShipmentQuantityColLetter}${rowNumber}`;
      const totalUsdCellAddress = `${totalUsdColumnLetter}${rowNumber}`;
      const shipmentQuantityCellAddress = `${shipmentQuantityColLetter}${rowNumber}`;

      const costFormula = `${shipmentQuantityCellAddress} * ${totalUsdCellAddress} / ${totalShipmentQuantityCellAddress}`;

      const shipmentCostCell = row.getCell(newColIndex);
      if (shipmentCostCell) {
        shipmentCostCell.value = { formula: costFormula };
      }
    });
  });

  const modifiedBuffer = await workbook.xlsx.writeBuffer();
  return modifiedBuffer;
}

function findColumnIndexByKeyName(worksheet, keyName) {
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
}

function columnIndexToLetter(columnIndex) {
  let columnLetter = "";
  let tempIndex = columnIndex;

  while (tempIndex > 0) {
    let remainder = (tempIndex - 1) % 26;
    columnLetter = String.fromCharCode(remainder + 65) + columnLetter;
    tempIndex = Math.floor((tempIndex - 1) / 26);
  }

  return columnLetter;
}
