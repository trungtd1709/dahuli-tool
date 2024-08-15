import { INTERNAL_ERROR } from "../shared/err-const.js";
import { CustomError } from "./custom-err.js";

export async function errorHandler(err, req, res, next) {
  console.error(err);
  if (err instanceof CustomError) {
    return res
      .status(err.statusCode)
      .json({ result: "Fail", message: err.message });
  }

  // console.error(err);

  // res.status(500).send({
  //   result: 'Failed',
  //   message: err.message || INTERNAL_ERROR,
  // });
}
