import dayjs from "dayjs";
import { CONFIG } from "./config.js";
import { TIME_FORMAT } from "./constant.js";

export const findIndexByFirstElement = ({ array, searchValue }) => {
  return array.findIndex((item) => item[0] === searchValue);
};

/**
 * Compares two strings case-insensitively.
 * @param {string} str1 - The first string to compare.
 * @param {string} str2 - The second string to compare.
 * @returns {boolean} True if the strings are equal (case-insensitive), otherwise false.
 */
export const compareStringsIgnoreCase = (str1, str2) => {
  return str1.toLowerCase() === str2.toLowerCase();
};

/**
 * Compares two strings case-insensitively.
 * @param {Array} arr1 - The first string to compare.
 * @param {Array} arr2 - The second string to compare.
 * @returns {Array} True if the strings are equal (case-insensitive), otherwise false.
 */
export const mergeArrays = (arr1, arr2, key) => {
  const merged = arr1.reduce((acc, obj1) => {
    const obj2 = arr2.find(
      (obj) => obj[key].toLowerCase() === obj1[key].toLowerCase()
    );
    if (obj2) {
      acc.push({ ...obj1, ...obj2 });
    } else {
      acc.push(obj1);
    }
    return acc;
  }, []);

  return merged;
};

export const evalCalculation = (expression, minDecimalPartLength = 4) => {
  try {
    let result = eval(expression);
    let decimalPart = result.toString().split(".")[1];

    if (decimalPart && decimalPart.length > minDecimalPartLength) {
      if (
        decimalPart[decimalPart.length - 2] == "0" &&
        decimalPart[decimalPart.length - 3] == "0" &&
        decimalPart[decimalPart.length - 4] == "0" &&
        decimalPart[decimalPart.length - 5] == "0"
      ) {
        let trimmedResult = parseFloat(
          result.toString().slice(0, -1)
        ).toString();
        return trimmedResult;
      }
      if (
        decimalPart[decimalPart.length - 2] == "9" &&
        decimalPart[decimalPart.length - 3] == "9" &&
        decimalPart[decimalPart.length - 4] == "9"
      ) {
        let integerPart = result.toString().split(".")[0];
        let truncatedDecimal = "";
        let firstNineIndex;

        // Find the first occurrence of '9' and stop there
        for (let i = 0; i < decimalPart.length; i++) {
          if (
            decimalPart[i] === "9" &&
            i > 1 &&
            decimalPart[i - 1] === "9" &&
            decimalPart[i - 2] === "9"
          ) {
            firstNineIndex = i - 2;
            break; // Stop when 3 consecutive '9's are found
          }
          truncatedDecimal += decimalPart[i];
        }
        let newDecimalPart;
        if (firstNineIndex) {
          newDecimalPart = decimalPart.slice(0, firstNineIndex + 1);
          const newResult = parseFloat(
            `${integerPart}.${newDecimalPart}`
          ).toFixed(firstNineIndex);
          return newResult;
        }
        return result.toFixed(4);
      } else {
        return expression;
      }
    }
    return result.toString();
  } catch (err) {
    console.log(err);
  }
};

export const isEmptyValue = (value) => {
  return (
    value === 0 ||
    value === "0" ||
    value === null ||
    value === undefined ||
    value === "" ||
    value === false ||
    value === "NaN" || // Check for string "NaN"
    (Array.isArray(value) && value.length === 0) || // Check for empty array
    (typeof value === "object" &&
      value !== null &&
      Object.keys(value).length === 0) ||
    Number.isNaN(value) // Check for numeric NaN
  );
};

export const removeValueAndSplash = (formula, valueToRemove) => {
  // Escape special characters in the value to remove (like ".")
  const escapedValue = valueToRemove.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Create a regex to match the pattern "/ valueToRemove"
  const regex = new RegExp(`\\s*/\\s*${escapedValue}`, "g");

  // Replace the matching pattern with an empty string
  let newFormula = formula.replace(regex, "");
  if (newFormula.includes("+")) {
    newFormula = `(${newFormula})`;
  }
  return newFormula;
};

export function removeStringAfter(str, delimiter) {
  const delimiterIndex = str.indexOf(delimiter);
  if (delimiterIndex !== -1) {
    // If the delimiter is found, return the substring from the start up to the delimiter
    return str.substring(0, delimiterIndex);
  }
  // If no delimiter is found, return the original string
  return str;
}

export function removeSpaces(str) {
  return str.replace(/\s+/g, "");
}

export const now = (format = TIME_FORMAT.YYYY_MM_DD_HH_mm_ss) => {
  let today = dayjs();
  return today.format(format).toString();
};

/**
 * @param {string} formula
 * @returns {string}
 */
export function simplifyFormula(formula) {
  const formulaParts = splitByPlus(formula) ?? [];
  const countMap = {};

  formulaParts.forEach((value) => {
    if (countMap[value]) {
      countMap[value]++;
    } else {
      countMap[value] = 1;
    }
  });

  const countResult = Object.keys(countMap).map((key) => ({
    value: key,
    quantity: countMap[key],
  }));

  const isAllQuantityOne = countResult.every((item) => item.quantity === 1);

  if (isAllQuantityOne) {
    return formula;
  } else {
    const formattedFormula = countResult.reduce((acc, item) => {
      const { value, quantity } = item;
      const itemValue = quantity == 1 ? value : `${value} * ${quantity}`;

      if (isEmptyValue(acc)) {
        return itemValue;
      }
      return `${acc} + ${itemValue}`;
    }, "");
    return formattedFormula;
  }
}

/**
 * @param {string} formula
 * @returns {Array}
 */
export function splitByPlus(string) {
  // Use the split method to split by "+" and exclude "+" in the resulting array
  const parts = string.split("+").map((part) => part.trim());

  return parts;
}

export function removeStringOnce(baseString, stringToRemove) {
  // Escape any special characters in stringToRemove, including "*"
  const escapedStringToRemove = stringToRemove.replace(
    /[-\/\\^$*+?.()|[\]{}]/g,
    "\\$&"
  );

  // Create a regular expression that matches stringToRemove with optional surrounding whitespace
  const regex = new RegExp(`${escapedStringToRemove}\\s*`, "i");

  // Replace only the first occurrence
  const result = baseString.replace(regex, "");

  return result; // Trim to remove any leading/trailing whitespace
}

export const removeWhitespace = (string) => {
  return string?.replace(/\s+/g, "");
};

/// remove key that not in [keyNameArr]
export const removeObjKeyNames = (obj, keyNameArr) => {
  Object.keys(obj).forEach((key) => {
    if (!keyNameArr.includes(key)) {
      delete obj[key];
    }
  });
  return obj;
};

export const rmDupEleFrArr = (arr = []) => {
  return [...new Set(arr)];
};

export const getUniqueValueFromObjArr = (arr = [], keyName) => {
  return [
    ...new Set(
      arr.map((item) => item[keyName]).filter((value) => !isEmptyValue(value)) // Filter out empty values
    ),
  ];
};

export const sortArrayBaseOnKey = (arr = [], key) => {
  return arr.sort((a, b) => {
    if (a?.[key] > b?.[key]) {
      return -1;
    }
    if (a?.[key] < b?.[key]) {
      return 1;
    }
    return 0;
  });
};

export function getMaxIndexKeyValue(obj, keyName) {
  // Step 1: Extract keys matching the pattern "In Stock" or "In Stock_X"
  const keys = Object.keys(obj).filter((key) => key.startsWith(keyName));

  let maxIndex = -1;
  let maxKey = keyName;

  keys.forEach((key) => {
    // Check if the key has an index and extract it
    const match = key.match(/In Stock(?:_(\d+))?/);
    if (match) {
      const index = match[1] ? parseInt(match[1], 10) : -1;
      if (index > maxIndex) {
        maxIndex = index;
        maxKey = key;
      }
    }
  });

  // Step 3: Return the value associated with the key having the biggest index
  return obj[maxKey];
}

export function containsAlphabet(str) {
  if (!str) {
    return false;
  }
  const regex = /[a-zA-Z]/;
  return regex.test(str);
}

export function removeDivideByNumber(str, number) {
  const regex = new RegExp(`/\\s*${number}`, "g");
  return str.replace(regex, "");
}

export function compareStrings(str1, str2) {
  const normalizeString = (str) =>
    str?.replace(/\s+/g, "")?.replace(/\r\n/g, "\n")?.trim()?.toLowerCase();

  const normalizedStr1 = normalizeString(str1);
  const normalizedStr2 = normalizeString(str2);

  return normalizedStr1 === normalizedStr2;
}

/**
 * Removes all newline characters (\n and \r\n) from a string.
 *
 * @param {string} str - The string from which newlines will be removed.
 * @returns {string} - The string with all newline characters removed.
 */
export function removeNewlines(str) {
  if (str) {
    return str?.replace(/[\n\r]+/g, "");
  } else {
    return str;
  }
}

/**
 * Compares two strings without considering spaces.
 *
 * @param {string} str1 - The first string to compare.
 * @param {string} str2 - The second string to compare.
 * @returns {boolean} - Returns true if the strings are equal ignoring spaces, false otherwise.
 */
export function compareStringsIgnoreSpaces(str1, str2) {
  // Remove all spaces from both strings
  if (!str1 || !str2) {
    return false;
  }
  const cleanedStr1 = str1.replace(/\s+/g, "");
  const cleanedStr2 = str2.replace(/\s+/g, "");

  // Compare the cleaned strings
  return cleanedStr1?.toLowerCase() === cleanedStr2?.toLowerCase();
}

export class Utils {
  static roundNumber = (num, minDecimalPartLength = 4) => {
    try {
      if (num) {
        let result = num.toString();
        let decimalPart = result.split(".")[1];

        if (decimalPart && decimalPart.length > minDecimalPartLength) {
          if (
            decimalPart[decimalPart.length - 2] == "0" &&
            decimalPart[decimalPart.length - 3] == "0" &&
            decimalPart[decimalPart.length - 4] == "0" &&
            decimalPart[decimalPart.length - 5] == "0"
          ) {
            let trimmedResult = parseFloat(
              result.toString().slice(0, -1)
            ).toString();
            return trimmedResult;
          }
          if (
            decimalPart[decimalPart.length - 2] == "9" &&
            decimalPart[decimalPart.length - 3] == "9" &&
            decimalPart[decimalPart.length - 4] == "9"
          ) {
            let integerPart = result.toString().split(".")[0];
            let firstNineIndex;

            // Find the first occurrence of '9' and stop there
            for (let i = 0; i < decimalPart.length; i++) {
              if (
                decimalPart[i] === "9" &&
                i > 1 &&
                decimalPart[i - 1] === "9" &&
                decimalPart[i - 2] === "9"
              ) {
                firstNineIndex = i - 2;
                break; // Stop when 3 consecutive '9's are found
              }
            }
            let newDecimalPart;
            if (firstNineIndex) {
              newDecimalPart = decimalPart.slice(0, firstNineIndex + 1);
              const newResult = parseFloat(
                `${integerPart}.${newDecimalPart}`
              ).toFixed(firstNineIndex);
              return parseFloat(newResult);
            }
            return parseFloat(result.toFixed(minDecimalPartLength));
          } else {
            return num;
          }
        }
        return num;
      }
      return null;
    } catch (err) {
      return num;
    }
  };

  static isValidDecimalPart(num) {
    // Check if the input is not a number
    if (typeof num !== "number" || !Number.isFinite(num)) {
      return false;
    }

    const decimalPart = num.toString().split(".")[1]; // Get the part after the decimal point

    if (!decimalPart) {
      return true; // No decimal part, valid number
    }

    return decimalPart.length <= CONFIG.MAX_DECIMAL_FIGURE; // Check if the decimal part is within the limit
  }

  static getUniqueValueFromObjArr = (arr = [], keyName) => {
    return [
      ...new Set(
        arr.map((item) => item[keyName]).filter((value) => !isEmptyValue(value)) // Filter out empty values
      ),
    ];
  };

  static includes = (str = "", subStr = "") => {
    if (typeof str !== "string" || typeof subStr !== "string") {
      return false;
    }

    // Normalize both strings by removing spaces and converting to lowercase
    const normalizedStr = str.replace(/\s+/g, "").toLowerCase();
    const normalizedSubStr = subStr.replace(/\s+/g, "").toLowerCase();

    return normalizedStr.includes(normalizedSubStr);
  };

  static appendNowToFileName(originalName) {
    const lastDotIndex = originalName.lastIndexOf('.');
    
    const name = originalName.substring(0, lastDotIndex);
    const ext = originalName.substring(lastDotIndex);
    const fileName = `${name}_${now(TIME_FORMAT.DD_MM_YYYY)}${ext}`;
  
    return fileName;
  }

  static equal(str1, str2) {
    // Remove all spaces from both strings
    if (!str1 || !str2) {
      return false;
    }
    const cleanedStr1 = str1.replace(/\s+/g, "");
    const cleanedStr2 = str2.replace(/\s+/g, "");
  
    // Compare the cleaned strings
    return cleanedStr1?.toLowerCase() === cleanedStr2?.toLowerCase();
  }
}
