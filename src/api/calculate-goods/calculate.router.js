import { Router } from "express";
import * as calculateController from "./calculate.controller.js";
import { multerUpload } from "../../middlewares/multer-upload.js";

export const calculateRouter = Router();

calculateRouter.post(
  "/calculate/sku",
  multerUpload.fields([
    { name: "order1", maxCount: 1 },
    { name: "order2", maxCount: 1 },
    { name: "order3", maxCount: 1 },
    { name: "order4", maxCount: 1 },
    { name: "skuList", maxCount: 1 },
    { name: "tsvFile", maxCount: 1 },
  ]),
  calculateController.calculateSku
);
