import dayjs from "dayjs";

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

export const evalCalculation = (expression) => {
  let result = eval(expression);
  let decimalPart = result.toString().split(".")[1];

  if (decimalPart && decimalPart.length > 4) {
    if (
      decimalPart[decimalPart.length - 2] == "9" &&
      decimalPart[decimalPart.length - 3] == "9" &&
      decimalPart[decimalPart.length - 4] == "9"
    ) {
      return result.toFixed(4);
    } else {
      return expression;
    }
  }
  return result.toString();
};

export const isEmptyValue = (value) => {
  return (
    value === 0 ||
    value === "0" ||
    value === null ||
    value === undefined ||
    value === "" ||
    value === false ||
    (Array.isArray(value) && value.length === 0) || // Check for empty array
    (typeof value === "object" &&
      value !== null &&
      Object.keys(value).length === 0)
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

export const now = () => {
  let today = dayjs();
  return today.format("YYYY-MM-DD HH:mm:ss").toString();
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
