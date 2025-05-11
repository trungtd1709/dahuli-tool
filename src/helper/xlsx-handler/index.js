import ExcelJS from "exceljs";
import XLSX from "xlsx";
import { BadRequestError } from "../../error/bad-request-err.js";
import { NegativeInStockPlace } from "../../model/index.js";
import {
  CASH_SYMBOL,
  CHECK_KEYWORD,
  FILE_TYPE,
  INPUT_KEY_NAME,
  KEY_PREFERENCES,
  OUTPUT_COL_ALPHABET,
  OUTPUT_KEY_NAME,
  OUTPUT_NUM_DECIMAL_FORMAT,
  SHIPMENT_OUTPUT_COL_ALPHABET,
  SHIPMENT_OUTPUT_KEY_NAME,
} from "../../shared/constant.js";
import { MISSING_DATA_COGS_FILE } from "../../shared/err-const.js";
import {
  Utils,
  compareStrings,
  containsAlphabet,
  isEmptyValue,
  now,
} from "../../shared/utils.js";
import { XlsxUtils } from "../../shared/xlsxUtils.js";

import { XlsxHelper } from "../xlsx-helper/index.js";

// exchangeRateKeyName tên cột có công thức chứa tỉ giá
/**
 * Converts an XLSX file to JSON.
 * @param {Multer.File} options.file - The uploaded file object from Multer.
 * @returns {Array}
 */
export const xlsxToJSON = async ({
  file,
  sheetIndex = 0,
  exchangeRateKeyName,
  paymentCostKeyName, // cái này là mảng
  isShippingFile = false, // check xem có phải file order 4 (shipping cost) ko
}) => {
  try {
    console.log(`${now()}: [CONVERTING] ${file.originalname}`);
    const workbook = XLSX.read(file.buffer, { type: "buffer" });

    const sheetName = workbook.SheetNames[sheetIndex];
    const worksheet = workbook.Sheets[sheetName];
    let jsonData = XLSX.utils.sheet_to_json(worksheet);

    // giá order USD
    let usdPriceData = await XlsxHelper.getWorksheetJsonData(file);

    usdPriceData.forEach((item) => {
      const usdPrice = item[INPUT_KEY_NAME.USD];
      const productName = item[INPUT_KEY_NAME.PRODUCT_NAME];

      const productIndex = jsonData.findIndex(
        (ele) => ele[INPUT_KEY_NAME.PRODUCT_NAME] == productName
      );

      if (productIndex >= 0 && usdPrice) {
        jsonData[productIndex][INPUT_KEY_NAME.USD] = usdPrice;
      }
    });

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
      const excelJsWorkbook = new ExcelJS.Workbook();
      await excelJsWorkbook.xlsx.load(file.buffer);
      const excelJsWorksheet = excelJsWorkbook.getWorksheet(1);
      getShippingCostFormulas(excelJsWorksheet, jsonData);
    }
    jsonData = changeObjKeyName(jsonData);

    const images = await XlsxHelper.getImagesFromXlsx(file);

    if (!isEmptyValue(images)) {
      jsonData = jsonData.map((data, index) => {
        const imageRowIndex = index + 1;
        const image = images.find((item) => {
          return item?.getRowIndex() == imageRowIndex;
        });
        if (image) {
          return { ...data, image };
        } else {
          return data;
        }
      });
    }

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
          if (exchangeRate && !!jsonData[R - 1]) {
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
  let paymentCostColumnsIndex = [];
  let productNameColumnIndex = -1;

  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: C });
    const cell = worksheet[cellAddress];
    if (cell && paymentCostKeyName.includes(cell.v)) {
      paymentCostColumnsIndex.push(C);
    }
    if (cell && cell.v === INPUT_KEY_NAME.PRODUCT_NAME) {
      productNameColumnIndex = C;
    }
  }

  if (isEmptyValue(paymentCostColumnsIndex)) {
    console.error(
      `Key name '${paymentCostKeyName}' not found in the first row.`
    );
  }

  if (productNameColumnIndex === -1) {
    console.error(
      `Key name '${INPUT_KEY_NAME.PRODUCT_NAME}' not found in the first row.`
    );
  }

  for (const paymentCostColumnIndex of paymentCostColumnsIndex) {
    // if (paymentCostColumnIndex >= 0) {
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      // Start from the second row
      const productNameCellAddress = XLSX.utils.encode_cell({
        r: R,
        c: productNameColumnIndex,
      });
      const productNameCell = worksheet[productNameCellAddress];
      const productName = productNameCell?.v?.toLowerCase();

      if (XlsxUtils.checkIsPaymentFee(productName)) {
        const paymentCostCellAddress = XLSX.utils.encode_cell({
          r: R,
          c: paymentCostColumnIndex,
        });
        const paymentCell = worksheet[paymentCostCellAddress];

        if (paymentCell && paymentCell.f) {
          const formula = paymentCell.f;
          // định dạng formula "SUM(E2:E5)/99"
          const paymentCostDivisor = extractDivisor(formula);
          // trick lỏ > 20
          if (paymentCostDivisor && parseInt(paymentCostDivisor) > 20) {
            return paymentCostDivisor;
          }
        }
      }
      // }
    }
  }
  return;
};

// lấy số sau dấu /
function extractDivisor(formula) {
  // if (formula.includes("SUM")) {
  const match = formula.match(/\/\s*([\d,\.]+)/);
  return match ? match[1].trim() : null;
  // } else {
  //   return null;
  // }
}

/**
 * @param {ExcelJS.WorkSheet} worksheet - The uploaded file object from Multer.
 * @returns {Array}
 */
const getShippingCostFormulas = (worksheet, jsonData) => {
  // priceShippingFormulaUsd

  if (!worksheet) {
    return;
  }

  let weightColIndex = -1,
    totalCnyColIndex = -1,
    totalUsdColIndex = -1,
    cnyPriceColIndex = -1,
    usdPriceColIndex = -1;

  let headers = [];
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber] = cell.text.trim();
    const colKeyName = cell?.value;

    if (compareStrings(colKeyName, INPUT_KEY_NAME.TOTAL_CNY)) {
      totalCnyColIndex = colNumber;
    }

    if (compareStrings(colKeyName, INPUT_KEY_NAME.TOTAL_USD)) {
      totalUsdColIndex = colNumber;
    }

    if (compareStrings(colKeyName, INPUT_KEY_NAME.CNY)) {
      cnyPriceColIndex = colNumber;
    }

    if (compareStrings(colKeyName, INPUT_KEY_NAME.USD)) {
      usdPriceColIndex = colNumber;
    }
    if (compareStrings(colKeyName, INPUT_KEY_NAME.WEIGHT)) {
      weightColIndex = colNumber;
    }
  });

  worksheet.eachRow({ includeEmpty: false }, (row, rowIndex) => {
    const rowValue = jsonData[rowIndex - 1];
    if (rowValue?.[INPUT_KEY_NAME.PRODUCT_NAME]) {
      const exchangeRate = rowValue?.exchangeRate;
      const cnyFileValue = rowValue?.[INPUT_KEY_NAME.CNY];
      const usdFileValue = rowValue?.[INPUT_KEY_NAME.USD];

      let cnyPrice = cnyFileValue;
      let usdPrice = rowValue?.[INPUT_KEY_NAME.USD];
      let totalCny = rowValue?.[INPUT_KEY_NAME.TOTAL_CNY];
      let totalUsd = rowValue?.[INPUT_KEY_NAME.TOTAL_USD];
      let weight = rowValue?.[INPUT_KEY_NAME.WEIGHT];

      if (
        (!cnyFileValue || !Utils.isValidDecimalPart(cnyFileValue)) &&
        !usdFileValue
      ) {
        if (weight) {
          if (totalCny) {
            cnyPrice = `${totalCny} / ${weight}`;
          }
        }
      }
      if (cnyFileValue && !usdFileValue) {
        if (exchangeRate) {
          usdPrice = `${cnyPrice} / ${exchangeRate}`;
        }
      }

      if (!cnyFileValue && usdFileValue) {
        if (exchangeRate) {
          cnyPrice = `${usdPrice} * ${exchangeRate}`;
        }
      }

      if (!usdPrice) {
        if (exchangeRate) {
          usdPrice = `${cnyPrice} / ${exchangeRate}`;
        }
      }

      jsonData[rowIndex - 1].priceShippingFormulaUsd = usdPrice;
      jsonData[rowIndex - 1].priceShippingFormulaCny = cnyPrice;
    }
    // const cnyPriceCell = row.getCell(cnyPriceColIndex);
    // const usdPriceCell = row.getCell(cnyPriceColIndex);
    // const totalCnyCell = row.getCell(cnyPriceColIndex);
    // const totalUsdCell = row.getCell(cnyPriceColIndex);
  });
};

export const cogsJsonToXlsx = async ({ json = [], sheetName = "Sheet1" }) => {
  try {
    if (json.length === 0) {
      throw new BadRequestError(MISSING_DATA_COGS_FILE);
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
    json.forEach((item, index) => {
      // C là cột quantity
      const quantityCell = `C${(index + 2).toString()}`;

      // thay giá trị quantityCell
      item[OUTPUT_KEY_NAME.PPU] = item[OUTPUT_KEY_NAME.PPU]
        ?.toString()
        ?.replace(/quantityCell/g, quantityCell);

      item[OUTPUT_KEY_NAME.CUSTOM_PACKAGE_COST] = item[
        OUTPUT_KEY_NAME.CUSTOM_PACKAGE_COST
      ]
        ?.toString()
        ?.replace(/quantityCell/g, quantityCell);
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
    addFormulaToWorksheetCogs({
      jsonData: json,
      worksheet,
    });
    addNumberFormatToWorksheet(worksheet);
    addStyleToCogsWorksheet(worksheet, firstRowNum);

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

const addFormulaToWorksheetCogs = ({ jsonData = [], worksheet }) => {
  jsonData.forEach((item, index) => {
    const rowNumber = index + 2; // Starting from row 2, assuming row 1 has headers
    const totalAmountFormula = item?.[OUTPUT_KEY_NAME.TOTAL_AMOUNT] ?? "";

    const cellAddresses = {
      ppu: `${OUTPUT_COL_ALPHABET.PPU}${rowNumber}`,
      customPackageCost: `${OUTPUT_COL_ALPHABET.CUSTOM_PACKAGE_COST}${rowNumber}`,
      packingLabelingCost: `${OUTPUT_COL_ALPHABET.PACKING_LABELING_COST}${rowNumber}`,
      domesticShippingCost: `${OUTPUT_COL_ALPHABET.DOMESTIC_SHIPPING_COST}${rowNumber}`,
      internationalShippingCost: `${OUTPUT_COL_ALPHABET.INTERNATIONAL_SHIPPING_COST}${rowNumber}`,
      paymentCost: `${OUTPUT_COL_ALPHABET.PAYMENT_COST}${rowNumber}`,
      cogs: `${OUTPUT_COL_ALPHABET.COGS}${rowNumber}`,
      amount: `${OUTPUT_COL_ALPHABET.AMOUNT}${rowNumber}`,
      totalAmount: `${OUTPUT_COL_ALPHABET.TOTAL_AMOUNT}${rowNumber}`,
    };

    const formulas = {
      cogs: `SUM(${OUTPUT_COL_ALPHABET.PPU}${rowNumber}:${OUTPUT_COL_ALPHABET.PAYMENT_COST}${rowNumber})`,
      amount: `${OUTPUT_COL_ALPHABET.COGS}${rowNumber} * ${OUTPUT_COL_ALPHABET.QUANTITY}${rowNumber}`,
      // totalAmount: `SUM(${OUTPUT_COL_ALPHABET.AMOUNT}${firstRowNum}:${OUTPUT_COL_ALPHABET.AMOUNT}${lastRowNum})`,
      totalAmount: totalAmountFormula,
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

    if (totalAmountFormula) {
      XlsxUtils.makeRowBold(worksheet, rowNumber);
    }
  });
};

/**
 * @param {ExcelJS.Worksheet} worksheet
 */
const addNumberFormatToWorksheet = (worksheet) => {
  const columnsToFormat = {
    PPU: "4_DIGITS",
    CUSTOM_PACKAGE_COST: "4_DIGITS",
    PACKING_LABELING_COST: "4_DIGITS",
    DOMESTIC_SHIPPING_COST: "4_DIGITS",
    INTERNATIONAL_SHIPPING_COST: "4_DIGITS",
    PAYMENT_COST: "4_DIGITS",
    COGS: "4_DIGITS",
    AMOUNT: "2_DIGITS",
    TOTAL_AMOUNT: "2_DIGITS",
  };

  Object.entries(columnsToFormat).forEach(([key, format]) => {
    worksheet.getColumn(OUTPUT_COL_ALPHABET[key]).numFmt =
      OUTPUT_NUM_DECIMAL_FORMAT[format];
  });
};

/**
 * Converts an XLSX file to JSON.
 * @param {ExcelJS.Worksheet} worksheet
 */
const addStyleToCogsWorksheet = (worksheet, firstRowNum) => {
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell, colNumber) => {
      // Apply red text color to the entire column J (COGS)

      if (
        XlsxUtils.columnIndexToLetter(colNumber) === OUTPUT_COL_ALPHABET.COGS
      ) {
        cell.font = {
          ...cell.font,
          color: { argb: "FF0000" },
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
        key.toLowerCase().includes(INPUT_KEY_NAME.PRODUCT_NAME.toLowerCase())
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

  // if (file.originalname.toLowerCase().includes(KEY_PREFERENCES.SHIPPING)) {
  //   return FILE_TYPE.SHIPPING;
  // }

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

  if (headers.find((item) => item.includes(CHECK_KEYWORD.PPU_ELEMENTS))) {
    return FILE_TYPE.SKU_LIST;
  }

  // File shipment cũng có weight nhưng đã chặn trước trong TH này
  if (
    headers.find((item) => item.includes(CHECK_KEYWORD.SHIPMENT_ID)) &&
    headers.find((item) => item.includes(CHECK_KEYWORD.SHIPMENT))
  ) {
    return FILE_TYPE.SHIPMENT;
  }

  if (
    headers.find((item) =>
      item?.toLowerCase().includes(CHECK_KEYWORD.WEIGHT.toLowerCase())
    )
  ) {
    return FILE_TYPE.SHIPPING;
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

  jsonData.forEach((item) => {
    const { [SHIPMENT_OUTPUT_KEY_NAME.IMAGE]: picture, ...restItem } = item;
    worksheet.addRow(restItem);
  });

  worksheet.addRow({ [SHIPMENT_OUTPUT_KEY_NAME.PRODUCT_NAME]: "TOTAL" });

  XlsxUtils.addHeightToEntireSheetCell(worksheet);

  jsonData.forEach((item, index) => {
    const rowNumber = index + 2;
    const order = item[SHIPMENT_OUTPUT_KEY_NAME.ORDER] ?? "";
    const isMoreThanOneOrder = order.includes("+");

    const itemName = item[SHIPMENT_OUTPUT_KEY_NAME.PRODUCT_NAME];
    const itemImageBuffer = item[SHIPMENT_OUTPUT_KEY_NAME.IMAGE];
    // reset buffer về rỗng để ko viết vào file excel
    const itemTotalUsd = item[SHIPMENT_OUTPUT_KEY_NAME.TOTAL_USD];
    const itemTotalCny = item[SHIPMENT_OUTPUT_KEY_NAME.TOTAL_CNY];
    const itemCnyPrice = item[SHIPMENT_OUTPUT_KEY_NAME.CNY_PRICE];
    const itemUsdPrice = item[SHIPMENT_OUTPUT_KEY_NAME.USD_PRICE];
    const itemQuantity = item[SHIPMENT_OUTPUT_KEY_NAME.QUANTITY];

    const quantityCellAdd = `${SHIPMENT_OUTPUT_COL_ALPHABET.QUANTITY}${rowNumber}`;
    const totalUsdCellAdd = `${SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_USD}${rowNumber}`;
    const totalCnyCellAdd = `${SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_CNY}${rowNumber}`;
    const cnyPriceCellAdd = `${SHIPMENT_OUTPUT_COL_ALPHABET.CNY_PRICE}${rowNumber}`;
    const usdPriceCellAdd = `${SHIPMENT_OUTPUT_COL_ALPHABET.USD_PRICE}${rowNumber}`;

    let totalUsdFormula = itemTotalUsd;
    let totalCnyFormula = itemTotalCny;
    let cnyPriceFormula = itemCnyPrice;
    let usdPriceFormula = "";

    if (itemQuantity && itemName != KEY_PREFERENCES.SUBTOTAL) {
      if (isMoreThanOneOrder) {
        usdPriceFormula = itemUsdPrice;
      } else {
        if (totalUsdFormula) {
          usdPriceFormula = `${totalUsdCellAdd} / ${quantityCellAdd}`;
        } else {
          usdPriceFormula = itemUsdPrice;
        }
      }
      if (!totalUsdFormula && usdPriceFormula) {
        totalUsdFormula = `${usdPriceFormula} * ${itemQuantity}`;
      }

      if (!cnyPriceFormula && totalCnyFormula) {
        cnyPriceFormula = `${totalCnyFormula} / ${itemQuantity}`;
      }

      if (!totalCnyFormula && cnyPriceFormula) {
        totalCnyFormula = `${cnyPriceFormula} * ${itemQuantity}`;
      }
    }

    setCellFormula(worksheet, totalCnyCellAdd, totalCnyFormula);
    setCellFormula(worksheet, totalUsdCellAdd, totalUsdFormula);
    setCellFormula(worksheet, cnyPriceCellAdd, cnyPriceFormula);
    setCellFormula(worksheet, usdPriceCellAdd, usdPriceFormula);
    setCellFormula(worksheet, quantityCellAdd, itemQuantity);

    if (itemImageBuffer) {
      const imgColIndex = XlsxUtils.columnLetterToIndex(
        SHIPMENT_OUTPUT_COL_ALPHABET.IMAGE
      );

      XlsxHelper.addImagesToExcel(
        workbook,
        worksheet,
        itemImageBuffer,
        imgColIndex,
        index + 2
      );
    }
  });

  const subTotalIndex =
    jsonData.findIndex(
      (item) =>
        item?.[SHIPMENT_OUTPUT_KEY_NAME.PRODUCT_NAME] ==
        KEY_PREFERENCES.SUBTOTAL
    ) + 2;

  const lastRowIndex = jsonData.length + 1;
  const sumQuantityFormula = `SUM(${
    SHIPMENT_OUTPUT_COL_ALPHABET.QUANTITY
  }${2}:${SHIPMENT_OUTPUT_COL_ALPHABET.QUANTITY}${lastRowIndex}) - ${
    SHIPMENT_OUTPUT_COL_ALPHABET.QUANTITY
  }${subTotalIndex}`;

  const sumTotalCnyFormula = `SUM(${
    SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_CNY
  }${2}:${SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_CNY}${lastRowIndex}) - ${
    SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_CNY
  }${subTotalIndex}`;

  const sumTotalUsdFormula = `SUM(${
    SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_USD
  }${2}:${SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_USD}${lastRowIndex}) - ${
    SHIPMENT_OUTPUT_COL_ALPHABET.TOTAL_USD
  }${subTotalIndex}`;

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
      } else {
        cell.alignment = { vertical: "middle" };
      }
    });
  });
};

/**
 * @param {ExcelJS.Worksheet} worksheet
 */
const addNumberFormatToShipment = (worksheet) => {
  const columnsToFormat = {
    CNY_PRICE: "4_DIGITS",
    USD_PRICE: "4_DIGITS",
    TOTAL_CNY: "4_DIGITS",
    TOTAL_USD: "4_DIGITS",
  };

  Object.entries(columnsToFormat).forEach(([key, format]) => {
    worksheet.getColumn(SHIPMENT_OUTPUT_COL_ALPHABET[key]).numFmt =
      OUTPUT_NUM_DECIMAL_FORMAT[format];
  });
};

export async function modifyOrder1File(file, allElements = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer);
  const worksheet = workbook.getWorksheet(1);

  let productNameColumnIndex = null;
  let quantityColumnIndex = null;
  let quantityColumnLetter = null;
  let totalUsdColumnIndex = null;
  let totalUsdColumnLetter = null;
  let oldInStockIndex;
  let oldCostInStockIndex = null;
  let oldCostInStockLetter = null;
  let lastRowIndex;
  let subtotalRowIndex = null;
  let paymentFeeRowIndex = null;
  const firstRowIndex = "2";
  const headerRow = worksheet.getRow(1);
  const headers = [];

  // đoạn này dùng thư viện XLSX
  const workbookXLSX = XLSX.read(file.buffer, { type: "buffer" });
  const sheetName = workbookXLSX.SheetNames[0];
  const worksheetXLSX = workbookXLSX.Sheets[sheetName];
  const paymentCostDivisor = getPaymentCostDivisor({
    worksheet: worksheetXLSX,
    paymentCostKeyName: [INPUT_KEY_NAME.TOTAL_USD, INPUT_KEY_NAME.TOTAL_CNY],
  });

  // end of dùng thư viện XLSX

  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber] = cell.text.trim();
    const colKeyName = cell?.value;
    if (
      colKeyName &&
      colKeyName.toString().trim().toLowerCase() ===
        INPUT_KEY_NAME.PRODUCT_NAME.toLowerCase()
    ) {
      productNameColumnIndex = colNumber;
    }

    if (
      colKeyName &&
      Utils.includes(colKeyName.toString(), KEY_PREFERENCES.QTY)
    ) {
      quantityColumnIndex = colNumber;
      quantityColumnLetter = XlsxUtils.columnIndexToLetter(quantityColumnIndex);
    }

    if (
      colKeyName &&
      Utils.includes(colKeyName.toString(), INPUT_KEY_NAME.TOTAL_USD)
    ) {
      totalUsdColumnIndex = colNumber;
      totalUsdColumnLetter = XlsxUtils.columnIndexToLetter(totalUsdColumnIndex);
    }

    if (Utils.equal(colKeyName, SHIPMENT_OUTPUT_KEY_NAME.IN_STOCK)) {
      oldInStockIndex = colNumber;
    }

    if (Utils.equal(colKeyName, SHIPMENT_OUTPUT_KEY_NAME.COST_IN_STOCK)) {
      oldCostInStockIndex = colNumber;
      oldCostInStockLetter = XlsxUtils.columnIndexToLetter(oldCostInStockIndex);
    }
  });

  // FIND SUBTOTAL AND PAYMENT FEE ROW INDEX
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const productNameCell = row.getCell(productNameColumnIndex);
    const productName = productNameCell?.value;
    if (productName?.includes(KEY_PREFERENCES.SUBTOTAL)) {
      subtotalRowIndex = rowNumber;
    }
    if (XlsxUtils.checkIsPaymentFee(productName)) {
      paymentFeeRowIndex = rowNumber;
    }
  });

  const isInStockExist = XlsxUtils.checkIfColumnExists(
    worksheet,
    SHIPMENT_OUTPUT_KEY_NAME.IN_STOCK
  );

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header row

    const rowData = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      rowData[headers[colNumber]] = cell.value;
    });

    lastRowIndex = rowNumber;
  });

  const shipmentKeys = Object.keys(allElements).sort() ?? [];

  // cái này liên quan đến UI cách cột thôi
  const shipmentStartColIndex = isInStockExist
    ? XlsxUtils.getLastColumnIndex(worksheet) + 3
    : XlsxUtils.getLastColumnIndex(worksheet) + 2;

  // ADD QUANTITY (left quantity)
  shipmentKeys.forEach((shipmentKey, index) => {
    const newColIndex = shipmentStartColIndex + index;
    headerRow.getCell(newColIndex).value = shipmentKey;

    worksheet.getColumn(newColIndex).width =
      XlsxUtils.getHeaderWidth(shipmentKey);

    // Add data for each row under the new column
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row

      const rowProductName = row.getCell(productNameColumnIndex)?.value;

      const shipmentDatas = allElements[shipmentKey] ?? [];

      const productObj = shipmentDatas.find((shipmentData) => {
        return compareStrings(shipmentData?.name, rowProductName);
      });

      if (!isEmptyValue(productObj)) {
        if (
          !Utils.includes(productObj?.name, KEY_PREFERENCES.PAYMENT_FEE) &&
          !Utils.includes(productObj?.name, KEY_PREFERENCES.PAYMENT_COST)
        ) {
        }
        row.getCell(newColIndex).value = productObj?.leftQuantity;
      }
    });
  });

  const shipmentLastColIndex = XlsxUtils.getLastColumnIndex(worksheet);
  const inStockColIndex = shipmentLastColIndex + 1;

  const shipmentStartColLetter = XlsxUtils.columnIndexToLetter(
    shipmentStartColIndex
  );
  const shipmentLastColLetter =
    XlsxUtils.columnIndexToLetter(shipmentLastColIndex);
  const inStockColLetter = XlsxUtils.columnIndexToLetter(inStockColIndex);

  // START ADD IN STOCK VALUE
  for (let rowNumber = 2; rowNumber <= lastRowIndex; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const quantityCell = row.getCell(quantityColumnIndex);
    const productNameCell = row.getCell(productNameColumnIndex);
    const productName = productNameCell.value;
    if (
      compareStrings(productName, KEY_PREFERENCES.PAYMENT_FEE) ||
      compareStrings(productName, KEY_PREFERENCES.PAYMENT_COST)
    ) {
      continue;
    }

    const oldInStockColLetter = XlsxUtils.columnIndexToLetter(oldInStockIndex);
    const totalShipmentQuantityLetter = oldInStockIndex
      ? oldInStockColLetter
      : quantityColumnLetter;

    const shipmentSumQuantityFormula = `SUM(${shipmentStartColLetter}${rowNumber}:${shipmentLastColLetter}${rowNumber})`;
    let formula = `${totalShipmentQuantityLetter}${rowNumber} - ${shipmentSumQuantityFormula}`;

    const inStockCell = row.getCell(inStockColIndex);

    if (oldInStockIndex) {
      const oldInStockCellAddress = `${oldInStockColLetter}${rowNumber}`;
      const oldInStockCell = worksheet.getCell(oldInStockCellAddress);
      const oldInStockFormula =
        oldInStockCell.value?.formula ?? oldInStockCell?.formula;
      if (oldInStockFormula) {
        formula = `${oldInStockFormula} - ${shipmentSumQuantityFormula}`;
      }

      checkNegative(
        worksheet,
        totalShipmentQuantityLetter,
        rowNumber,
        shipmentStartColIndex,
        shipmentLastColIndex,
        inStockColLetter,
        totalUsdColumnLetter,
        allElements
      );
    }

    // Xử lý sub total đoạn in stock
    if (rowNumber == subtotalRowIndex) {
      for (
        let colIndex = shipmentStartColIndex;
        colIndex <= shipmentLastColIndex;
        colIndex++
      ) {
        const colLetter = XlsxUtils.columnIndexToLetter(colIndex);
        const subtotalFormula = `SUM(${colLetter}${2}:${colLetter}${
          rowNumber - 1
        })`;
        const inStockSubTotalCell = row.getCell(colLetter);
        if (inStockSubTotalCell) {
          inStockSubTotalCell.value = { formula: subtotalFormula };
        }
      }
    }

    inStockCell.value = { ...inStockCell.value, formula };
  }
  // END ADD IN STOCK VALUE

  // ADD HEADER NAME FOR IN STOCK COLUMN
  const inStockHeaderName = SHIPMENT_OUTPUT_KEY_NAME.IN_STOCK;
  headerRow.getCell(inStockColIndex).value = inStockHeaderName;
  worksheet.getColumn(inStockColIndex).width =
    XlsxUtils.getHeaderWidth(inStockHeaderName);
  XlsxUtils.centerValueColumn(worksheet, inStockColIndex);

  headerRow.getCell(inStockColIndex + 1).value = "";

  // START SET GIÁ TRỊ HÀNG TOTAL DƯỚI CÙNG
  for (let i = shipmentStartColIndex; i <= inStockColIndex; i++) {
    const shipmentColLetter = XlsxUtils.columnIndexToLetter(i);
    const shipmentTotalCellAddress = `${shipmentColLetter}${lastRowIndex}`;
    let totalFormula;
    if (subtotalRowIndex && paymentCostDivisor) {
      totalFormula = `SUM(${shipmentColLetter}${subtotalRowIndex}:${shipmentColLetter}${
        lastRowIndex - 1
      })`;
    } else {
      totalFormula = `SUM(${shipmentColLetter}${firstRowIndex}:${shipmentColLetter}${
        lastRowIndex - 1
      })`;
    }
    setCellFormula(worksheet, shipmentTotalCellAddress, totalFormula);
  }
  // END HÀNG TOTAL

  // START ADD COST
  const costStartColIndex = XlsxUtils.getLastColumnIndex(worksheet) + 1;
  const costStartColLetter = XlsxUtils.columnIndexToLetter(costStartColIndex);

  shipmentKeys.forEach((shipmentKey, index) => {
    const newColIndex = XlsxUtils.getLastColumnIndex(worksheet) + 1;
    const newColLetter = XlsxUtils.columnIndexToLetter(newColIndex);

    const costKeyName = `Cost ${shipmentKey}`;
    headerRow.getCell(newColIndex).value = costKeyName;
    worksheet.getColumn(newColIndex).width =
      XlsxUtils.getHeaderWidth(costKeyName);

    // Add data for each row under the new column
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const quantityCell = row.getCell(quantityColumnIndex);
      if(!quantityCell?.value || !Utils.isNumber(quantityCell?.value)) return;

      const shipmentQuantityColLetter = XlsxUtils.columnIndexToLetter(
        XlsxUtils.findColumnIndexByKeyName(worksheet, shipmentKey)
      );
      const totalShipmentQuantityColLetter = quantityColumnLetter;

      const totalShipmentQuantityCellAddress = `${totalShipmentQuantityColLetter}${rowNumber}`;
      const totalUsdCellAddress = `${totalUsdColumnLetter}${rowNumber}`;
      const shipmentQuantityCellAddress = `${shipmentQuantityColLetter}${rowNumber}`;

      let costFormula = `${shipmentQuantityCellAddress} * ${totalUsdCellAddress} / ${totalShipmentQuantityCellAddress}`;

      if (rowNumber === lastRowIndex) {
        costFormula = `SUM(${newColLetter}2:${newColLetter}${
          lastRowIndex - 1
        })`;
      }
      const shipmentCostCell = row.getCell(newColIndex);

      if (shipmentCostCell && rowNumber != paymentFeeRowIndex) {
        // xử lý sub total đoạn code in stock
        if (rowNumber == subtotalRowIndex) {
          const subtotalFormula = `SUM(${newColLetter}${2}:${newColLetter}${
            rowNumber - 1
          })`;
          shipmentCostCell.value = { formula: subtotalFormula };
        } else if (rowNumber == lastRowIndex && subtotalRowIndex) {
          const totalFormula = `SUM(${newColLetter}${subtotalRowIndex}:${newColLetter}${
            lastRowIndex - 1
          })`;
          shipmentCostCell.value = { formula: totalFormula };
        } else {
          shipmentCostCell.value = { formula: costFormula };
        }
      }

      // Phải có hàng subtotal thì mói điền payment fee
      if (
        rowNumber == paymentFeeRowIndex &&
        subtotalRowIndex &&
        paymentCostDivisor
      ) {
        const correspondingSubtotalCellAdd = `${newColLetter}${subtotalRowIndex}`;
        const paymentCostFormula = `${correspondingSubtotalCellAdd} / ${paymentCostDivisor}`;
        const paymentCostCellAdd = `${newColLetter}${paymentFeeRowIndex}`;
        const paymentCostCell = worksheet.getCell(paymentCostCellAdd);
        paymentCostCell.value = { formula: paymentCostFormula };
      }
    });
  });

  const costLastColIndex = XlsxUtils.getLastColumnIndex(worksheet);
  const costLastColLetter = XlsxUtils.columnIndexToLetter(costLastColIndex);
  // END OF ADD COST

  // START ADD COST IN STOCK TO LAST COLUMN
  const costInStockIndex = XlsxUtils.getLastColumnIndex(worksheet) + 1;
  const costInStockLetter = XlsxUtils.columnIndexToLetter(costInStockIndex);
  const costInstockColName = SHIPMENT_OUTPUT_KEY_NAME.COST_IN_STOCK;

  headerRow.getCell(costInStockIndex).value = costInstockColName;

  worksheet.getColumn(costInStockIndex).width =
    XlsxUtils.getHeaderWidth(costInstockColName);
  XlsxUtils.centerValueColumn(worksheet, costInStockIndex);

  for (let rowNumber = 2; rowNumber <= lastRowIndex; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const productNameCell = row.getCell(productNameColumnIndex);
    const productName = productNameCell.value;

    // ko remove comment này
    let costInStockFormula;
    const totalCostOfThisShipment = `SUM(${costStartColLetter}${rowNumber}:${costLastColLetter}${rowNumber})`;

    if (oldCostInStockLetter) {
      const oldCostInStockCell = row.getCell(oldCostInStockLetter);
      const oldCostInStockValue =
        oldCostInStockCell?.formula ?? oldCostInStockCell?.value;
      costInStockFormula = `${oldCostInStockValue} - ${totalCostOfThisShipment}`;
    } else {
      const totalUsdCellAdd = `${totalUsdColumnLetter}${rowNumber}`;
      costInStockFormula = `${totalUsdCellAdd} - ${totalCostOfThisShipment}`;
    }

    const costInStockCell = row.getCell(costInStockIndex);
    const formula = costInStockFormula;

    if (costInStockCell) {
      if (productName && productName?.includes(KEY_PREFERENCES.SUBTOTAL)) {
        const subtotalTotalFormula = `SUM(${costInStockLetter}2:${costInStockLetter}${
          rowNumber - 1
        })`;
        costInStockCell.value = { formula: subtotalTotalFormula };
      }
      costInStockCell.value = {
        ...costInStockCell.value,
        formula,
      };
      if (compareStrings(productName, KEY_PREFERENCES.TOTAL)) {
        const totalCostInStockFormula = `SUM(${costInStockLetter}2:${costInStockLetter}${
          lastRowIndex - 1
        })`;
        costInStockCell.value = {
          ...costInStockCell.value,
          formula: totalCostInStockFormula,
        };
      }
    }
  }
  // END ADD COST IN STOCK

  if (oldInStockIndex) {
    XlsxUtils.clearColumnData(worksheet, oldInStockIndex);
  }
  if (oldCostInStockIndex) {
    XlsxUtils.clearColumnData(worksheet, oldCostInStockIndex);
  }

  for (
    let colIndex = costStartColIndex;
    colIndex <= costLastColIndex;
    colIndex++
  ) {
    XlsxUtils.addDollarSignToColumn(worksheet, colIndex);
    XlsxUtils.alignRightValueColumn(worksheet, colIndex);
  }

  XlsxUtils.addDollarSignToColumn(worksheet, costInStockIndex);
  XlsxUtils.alignRightValueColumn(worksheet, costInStockIndex);

  XlsxUtils.removeColStyleAndNumFmt(worksheet, inStockColIndex);
  for (
    let colIndex = shipmentStartColIndex;
    colIndex <= shipmentLastColIndex;
    colIndex++
  ) {
    XlsxUtils.removeColStyleAndNumFmt(worksheet, colIndex);
    XlsxUtils.alignRightValueColumn(worksheet, colIndex);
  }
  XlsxUtils.adjustColumnWidths(worksheet);

  const modifiedBuffer = await workbook.xlsx.writeBuffer();
  return modifiedBuffer;
}

/**
 * Converts an XLSX file to JSON.
 * @param {ExcelJS.Worksheet} worksheet
 * @returns {Array}
 */
function checkNegative(
  worksheet,
  totalShipmentQuantityColLetter,
  rowNumber,
  shipmentStartColIndex,
  shipmentLastColIndex,
  inStockColLetter,
  totalUsdColLetter,
  allElements
) {
  // Step 1: Get the value of total shipment quantity
  const totalShipmentCell = worksheet.getCell(
    `${totalShipmentQuantityColLetter}${rowNumber}`
  );
  const totalShipmentQuantity = parseFloat(
    totalShipmentCell.value?.result ?? totalShipmentCell.result
  );
  let negativeInStockPlaceArr = [];

  if (isNaN(totalShipmentQuantity) || totalShipmentQuantity < 0) {
    return negativeInStockPlaceArr;
  }

  let shipmentSum = 0;
  for (
    let colIndex = shipmentStartColIndex;
    colIndex <= shipmentLastColIndex;
    colIndex++
  ) {
    const cellValue = XlsxUtils.getCellValue(worksheet, colIndex, rowNumber);
    shipmentSum += cellValue;
  }

  // Step 2: Get the values in the shipment range
  let tempShipmentSum = 0;
  for (
    let colIndex = shipmentStartColIndex;
    colIndex <= shipmentLastColIndex;
    colIndex++
  ) {
    const rowInStockCellAddress = `${inStockColLetter}${rowNumber}`;
    const rowInStockCell = worksheet.getCell(rowInStockCellAddress);

    const colLetter = XlsxUtils.columnIndexToLetter(colIndex); // Convert column index to letter
    const cellValue = XlsxUtils.getCellValue(worksheet, colIndex, rowNumber);

    tempShipmentSum += cellValue;
    const quantity = totalShipmentQuantity - tempShipmentSum;

    const productName = getCellValue(worksheet, "B", rowNumber);
    const shipment = getCellValue(worksheet, colLetter, 1);
    const productIndex = allElements[shipment].findIndex((item) =>
      compareStrings(item.name, productName)
    );

    if (productIndex < 0) {
      // throw new BadRequestError(`${CANT_FIND_ELEMENT}: ${productName}`);
      continue;
    }

    // đã tính hết giá trị và đang là cột cuối
    if (quantity >= 0) {
      allElements[shipment][productIndex].leftQuantity = 0;
      if (colIndex == shipmentLastColIndex) {
        rowInStockCell.value = { ...rowInStockCell.value, result: quantity };
      }
    }

    if (quantity < 0) {
      // giá trị phải đẩy sang file order mới
      const leftValue = -quantity;

      // giá trị giữ ở file order này
      const remainValue = cellValue - leftValue;
      const remainValueCellAddress = `${XlsxUtils.columnIndexToLetter(
        colIndex
      )}${rowNumber}`;
      const remainValueCell = worksheet.getCell(remainValueCellAddress);
      remainValueCell.value = remainValue;

      if (rowInStockCell) {
        rowInStockCell.value = { ...rowInStockCell.value, result: 0 };
      }

      // phần tử ở vị trí thiếu
      negativeInStockPlaceArr.push(
        NegativeInStockPlace.fromJson({
          productName,
          shipment,
          leftValue: cellValue - remainValue,
        })
      );

      allElements[shipment][productIndex].leftQuantity =
        allElements[shipment][productIndex].leftQuantity - remainValue;

      // reset các giá trị quantity sau cột này về ""
      for (let i = colIndex + 1; i <= shipmentLastColIndex; i++) {
        // gán giá trị quantity các cột còn lại = 0
        const quantityShipmentCellAddress = `${XlsxUtils.columnIndexToLetter(
          i
        )}${rowNumber}`;
        const quantityShipmentCell = worksheet.getCell(
          quantityShipmentCellAddress
        );

        const shipment = getCellValue(
          worksheet,
          XlsxUtils.columnIndexToLetter(i),
          1
        );
        if (quantityShipmentCell.value) {
          negativeInStockPlaceArr.push(
            NegativeInStockPlace.fromJson({
              productName,
              shipment,
              leftValue: quantityShipmentCell.value,
            })
          );
        }
        quantityShipmentCell.value = null;
      }

      break;
    }
  }

  return;
}

/**
 * Converts an XLSX file to JSON.
 * @param {Multer.File} file
 * @param {Array<InputShippingCost>} allInputShippingCost
 * @returns {Array}
 */
export async function modifyShippingFile(
  file,
  allElements = {},
  allInputShippingCost = [],
  inputTsvDataArr = []
) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer);
  const worksheet = workbook.getWorksheet(1);

  let productNameColumnIndex = null;
  let quantityColumnIndex = null;
  let quantityColumnLetter = null;
  let totalUsdColumnIndex = null;
  let totalUsdColumnLetter = null;
  let subtotalRowIndex;
  let paymentFeeRowIndex;
  let lastRowIndex;
  let oldCostInStockIndex;
  let lastShippingRowIndex;
  let paymentCostDivisor;

  // index của cột đầu tiên có thông tin cost
  let firstCostColumnIndex = null;

  const firstRowIndex = "2";
  const headerRow = worksheet.getRow(1);

  const headers = [];
  const jsonData = [];

  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber] = cell.text.trim();
    const colKeyName = cell?.value;
    if (
      colKeyName &&
      colKeyName.toString().trim().toLowerCase() ===
        INPUT_KEY_NAME.PRODUCT_NAME.toLowerCase()
    ) {
      productNameColumnIndex = colNumber;
    }

    // tìm cột đầu tiên chứa chữ cost
    if (
      colKeyName &&
      colKeyName.includes(KEY_PREFERENCES.COST) &&
      !firstCostColumnIndex
    ) {
      firstCostColumnIndex = colNumber;
    }

    if (
      colKeyName &&
      colKeyName
        .toString()
        .trim()
        .toLowerCase()
        .includes(KEY_PREFERENCES.QTY.toLowerCase())
    ) {
      quantityColumnIndex = colNumber;
      quantityColumnLetter = XlsxUtils.columnIndexToLetter(quantityColumnIndex);
    }

    if (
      colKeyName &&
      colKeyName.toString().trim() == INPUT_KEY_NAME.TOTAL_USD
    ) {
      totalUsdColumnIndex = colNumber;
      totalUsdColumnLetter = XlsxUtils.columnIndexToLetter(totalUsdColumnIndex);
    }

    if (colKeyName === SHIPMENT_OUTPUT_KEY_NAME.COST_IN_STOCK) {
      oldCostInStockIndex = colNumber;
    }
  });

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const productNameCell = row.getCell(productNameColumnIndex);
    const productName = productNameCell?.value;
    if (productName?.includes(KEY_PREFERENCES.SUBTOTAL)) {
      subtotalRowIndex = rowNumber;
    }
    if (XlsxUtils.checkIsPaymentFee(productName)) {
      paymentFeeRowIndex = rowNumber;
    }
  });

  // đoạn này dùng thư viện XLSX
  if (paymentFeeRowIndex) {
    const workbookXLSX = XLSX.read(file.buffer, { type: "buffer" });
    const sheetName = workbookXLSX.SheetNames[0];
    const worksheetXLSX = workbookXLSX.Sheets[sheetName];
    paymentCostDivisor = getPaymentCostDivisor({
      worksheet: worksheetXLSX,
      paymentCostKeyName: [INPUT_KEY_NAME.TOTAL_USD, INPUT_KEY_NAME.TOTAL_CNY],
    });
  }
  // end of dùng thư viện XLSX

  if (oldCostInStockIndex) {
    XlsxUtils.deleteColumn(worksheet, oldCostInStockIndex);
  }

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header row

    const rowData = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      rowData[headers[colNumber]] = cell.value;
    });
    jsonData.push(rowData);

    lastRowIndex = rowNumber;
  });
  lastShippingRowIndex = lastRowIndex - 1;

  if (paymentFeeRowIndex) {
    lastShippingRowIndex = lastShippingRowIndex - 1;
  }
  if (subtotalRowIndex) {
    lastShippingRowIndex = lastShippingRowIndex - 1;
  }

  const shipmentKeys = Object.keys(allElements).sort() ?? [];
  const shipmentStartColIndex = headerRow.cellCount + 1;

  // START ADD SHIPPING COST
  shipmentKeys.forEach((shipmentKey, index) => {
    const newColIndex = shipmentStartColIndex + index;
    const newColLetter = XlsxUtils.columnIndexToLetter(newColIndex);
    const headerText = `Cost ${shipmentKey}`;
    headerRow.getCell(newColIndex).value = headerText;

    worksheet.getColumn(newColLetter).numFmt =
      OUTPUT_NUM_DECIMAL_FORMAT["2_DIGITS"];

    worksheet.getColumn(newColLetter).width =
      XlsxUtils.getHeaderWidth(headerText);

    // START ADD PAYMENT FEE
    if (paymentFeeRowIndex && paymentCostDivisor) {
      const paymentFeeFormula = `SUM(${newColLetter}${2}:${newColLetter}${lastShippingRowIndex}) / ${paymentCostDivisor}`;
      const paymentFeeCellAddress = `${newColLetter}${paymentFeeRowIndex}`;
      const paymentFeeCell = worksheet.getCell(paymentFeeCellAddress);
      paymentFeeCell.value = {
        formula: paymentFeeFormula,
      };
    }

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row

      const rowProductName = row.getCell(productNameColumnIndex).value;

      const shippingCostObj = allInputShippingCost.find((item) => {
        const { shipment, originalShipment } = item;
        return (
          compareStrings(item.name, rowProductName) &&
          (compareStrings(shipment, shipmentKey) ||
            compareStrings(originalShipment, shipmentKey))
        );
      });

      if (!isEmptyValue(shippingCostObj)) {
        const { shipment, originalShipment, totalUsd, totalShipmentQuantity } =
          shippingCostObj;

        let shipmentQuantity = shippingCostObj?.shipmentQuantity;
        let formula = "";
        const shippingRowName = row.getCell(productNameColumnIndex).value;
        if (
          shippingRowName?.includes(originalShipment) &&
          originalShipment != shipment
        ) {
          formula = `${totalUsd}`;
        } else if (shippingRowName?.includes(shipment)) {
          formula = `${totalUsd} / ${totalShipmentQuantity} * ${shipmentQuantity}`;
        }
        if (formula) {
          row.getCell(newColIndex).value = { formula };
        }
      }
    });
  });
  // END ADD SHIPPING COST

  const shipmentLastColIndex = headerRow.cellCount;

  const shipmentStartColLetter = XlsxUtils.columnIndexToLetter(
    shipmentStartColIndex
  );
  const shipmentLastColLetter =
    XlsxUtils.columnIndexToLetter(shipmentLastColIndex);

  // set giá trị cho hàng total
  for (let i = shipmentStartColIndex; i <= shipmentLastColIndex; i++) {
    const shipmentColLetter = XlsxUtils.columnIndexToLetter(i);
    const shipmentTotalCellAddress = `${shipmentColLetter}${lastRowIndex}`;
    const totalFormula = `SUM(${shipmentColLetter}${firstRowIndex}:${shipmentColLetter}${
      lastRowIndex - 1
    })`;
    setCellFormula(worksheet, shipmentTotalCellAddress, totalFormula);
  }

  // Add Cost In Stock value to last column
  const costInStockIndex = XlsxUtils.getLastColumnIndex(worksheet) + 1;

  const costInStockHeaderText = SHIPMENT_OUTPUT_KEY_NAME.COST_IN_STOCK;
  headerRow.getCell(costInStockIndex).value = costInStockHeaderText;
  worksheet.getColumn(costInStockIndex).width = XlsxUtils.getHeaderWidth(
    costInStockHeaderText
  );

  worksheet.getColumn(costInStockIndex).eachCell((cell) => {
    // add $ sign
    cell.numFmt = OUTPUT_NUM_DECIMAL_FORMAT.$_2_DIGITS;
  });

  for (let rowNumber = 2; rowNumber <= lastRowIndex; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const totalUsdCellAddress = `${totalUsdColumnLetter}${rowNumber}`;

    // ko remove đoạn code dưới
    // const shipmentStartCellAddress = `${shipmentStartColLetter}${rowNumber}`;
    // const shipmentLastCellAddress = `${shipmentLastColLetter}${rowNumber}`;

    const costStartIndex = firstCostColumnIndex ?? shipmentStartColIndex;
    const costStartLetter = XlsxUtils.columnIndexToLetter(costStartIndex);

    const costStartCellAddress = `${costStartLetter}${rowNumber}`;
    const costLastCellAddress = `${shipmentLastColLetter}${rowNumber}`;

    const totalCostInStockFormula = `${totalUsdCellAddress} - SUM(${costStartCellAddress}:${costLastCellAddress})`;
    const costInStockCell = row.getCell(costInStockIndex);

    if (costInStockCell) {
      costInStockCell.value = {
        ...costInStockCell.value,
        formula: totalCostInStockFormula,
      };
    }
  }

  const modifiedBuffer = await workbook.xlsx.writeBuffer();
  return modifiedBuffer;
}

/**
 * Converts an XLSX file to JSON.
 * @param {ExcelJS.Worksheet} worksheet
 * @returns {Array}
 */
export const getCellValue = (worksheet, colLetter, rowIndex) => {
  // const colLetter = XlsxUtils.columnIndexToLetter(colIndex);
  const cellAddress = `${colLetter}${rowIndex}`;
  const cell = worksheet.getCell(cellAddress);
  if (cell) {
    return cell.value;
  } else {
    return null;
  }
};
