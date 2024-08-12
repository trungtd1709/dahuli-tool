import { Router } from "express";
import * as calculateController from "./calculate.controller.js";

export const calculateRouter = Router();

calculateRouter.get("/calculate/sku", calculateController.calculateSku);
