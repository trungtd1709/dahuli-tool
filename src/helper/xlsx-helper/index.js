import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";
// import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// exchangeRateKeyName tên cột có công thức chứa tỉ giá
export const xlsxToJSON = ({
  sheetIndex = 0,
  fileName,
  exchangeRateKeyName,
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

    return jsonData;
  } catch (err) {
    console.log("[ERR CONVERT XLSX --> JSON]:", err);
  }
};

export const jsonToXLSX = ({ json, sheetName = "Sheet1" }) => {
  try {
    // Create a new workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(json);
    worksheet["!cols"] = calculateColumnWidths(json);

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const fileName = "test.xlsx";
    const filePath = path.resolve(
      __dirname,
      `../../../sample-file/${fileName}`
    );
    XLSX.writeFile(workbook, filePath);

    console.log(`XLSX file created at ${filePath}`);
  } catch (err) {
    console.error("Error creating XLSX file:", err);
  }
};

const calculateColumnWidths = (data) => {
  const keys = Object.keys(data[0]);
  return keys.map((key) => {
    const maxLength = Math.max(
      key.length, // Length of the column header
      ...data.map((item) => String(item[key]).length) // Length of the data in each cell
    );
    return { wch: maxLength + 10 }; // Adding some padding
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
        } else {
          console.log("No match found");
        }
      }
    }
  }
  console.log(formulas);
  return;
};
