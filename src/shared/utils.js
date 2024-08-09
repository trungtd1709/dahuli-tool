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

  // arr2.forEach(obj2 => {
  //   if (!arr1.find(obj1 => obj1[key] === obj2[key])) {
  //     merged.push(obj2);
  //   }
  // });

  return merged;
};

export const evalCalculation = (expression) => {
  let result = eval(expression);
  let decimalPart = result.toString().split(".")[1];

  if (decimalPart && decimalPart.length > 4) {
    if (
      decimalPart[decimalPart.length - 1] == "9" &&
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
