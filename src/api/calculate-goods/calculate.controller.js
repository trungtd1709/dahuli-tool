import { now } from "../../shared/utils.js";
import * as calculateService from "./calculate.service.js";

export async function calculateSku(req, res) {
  const { files } = req;
  const zipFile = await calculateService.calculateGood(files);

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="result.zip"');
  res.send(zipFile);
  console.log(`${now()}: [Send ZIP File success]`);

}
