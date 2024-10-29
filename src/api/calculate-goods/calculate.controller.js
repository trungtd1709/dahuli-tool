import * as calculateService from "./calculate.service.js";
import os from "os";
import fs from "fs/promises";
import path from "path";
import { now } from "../../shared/utils.js";

export async function calculateSku(req, res) {
  const { files } = req;
  const zipFile = await calculateService.calculateGood(files);

  // Define the path to the Downloads folder
  const downloadsPath = path.join(os.homedir(), "Downloads", "result.zip");

  // Save the zip file to the Downloads folder
  await fs.writeFile(downloadsPath, zipFile);

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="result.zip"');
  res.send(zipFile);
  console.log(`${now()}: [Send ZIP File success]`);
}
