import express from "express";
import { calculateGood } from "./src/api/calculate-goods/calculate.service.js";
import { apiRouter } from "./src/api/index.js";
import path from "path";
import XLSX from "xlsx";
import { fileURLToPath } from "url";

// import cors from 'cors';

const app = express();
const port = 3000;

calculateGood();
// app.use("/api", apiRouter);
// app.use(express.json({ limit: "10mb" }));
// app.use(express.urlencoded({ extended: true, limit: "10mb" }));
// // app.use(cors());

// app.get('/api/', (req, res) => {
//   res.send('Hello World!');
// });

// app.listen(port, () => {
//   console.log(`Server is running at http://localhost:${port}`);
// });
