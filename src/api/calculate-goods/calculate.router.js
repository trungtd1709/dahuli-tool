import { Router } from "express";
import * as calculateController from "./calculate.controller.js";
import { multerUpload } from "../../middlewares/multer-upload.js";

export const calculateRouter = Router();

calculateRouter.post(
  "/calculate/sku",
  multerUpload.fields([
    { name: "order1File", maxCount: 1 },
    { name: "printtingFeeFile", maxCount: 1 },
    { name: "packingCostFile", maxCount: 1 },
    { name: "shippingFile", maxCount: 1 },
    { name: "skuListFile", maxCount: 1 },
    { name: "tsvFile", maxCount: 1 },
  ]),
  calculateController.calculateSku
);
