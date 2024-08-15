import { INTERNAL_ERROR } from "../shared/err-const.js";
import { CustomError } from "./custom-err.js";

export async function errorHandler(err, req, res, next) {
  console.error(err);
  res.status(500).json({ result: "Fail", message: err.message });
  // if (err instanceof CustomError) {
  //   return res.status(err.statusCode).send(err.respond());
  // }

  // console.error(err);

  // res.status(500).send({
  //   result: 'Failed',
  //   message: err.message || INTERNAL_ERROR,
  // });
}
