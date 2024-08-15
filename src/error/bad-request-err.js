import { CustomError } from "./custom-err.js";

export class BadRequestError extends CustomError {
  constructor(message) {
    super(message, 400);
  }

  respond() {
    return {
        result: 'Fail',
        message: this.message,
    };
}
}
