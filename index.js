import express from "express";
import 'express-async-errors';
import { apiRouter } from "./src/api/index.js";
import { errorHandler } from "./src/error/err-handler.js";

// import cors from 'cors';

const app = express();
const port = 3000;

app.use("/api", apiRouter);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
// app.use(cors());

app.get("/test", async (req, res) => {
  test();
});

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

const test = () => {
  throw new Error("Test");
}