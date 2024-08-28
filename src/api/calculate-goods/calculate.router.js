import { Router } from "express";
import * as calculateController from "./calculate.controller.js";
import { multerUpload } from "../../middlewares/multer-upload.js";

export const calculateRouter = Router();

calculateRouter.post(
  "/calculate/sku",
  multerUpload.array("files", 20),
  calculateController.calculateSku
);
