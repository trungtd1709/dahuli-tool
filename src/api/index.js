import { Router } from "express";
import { calculateRouter } from "./calculate-goods/calculate.router.js";

export const apiRouter = Router();

apiRouter.use(calculateRouter);
