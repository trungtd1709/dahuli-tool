import * as calculateService from "./calculate.service.js";

export async function calculateSku(req, res) {
  const { files } = req;
  const zipFile = await calculateService.calculateGood(files);

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="result.zip"');

  res.send(zipFile);
  
  // const xlsxBuffer = await calculateService.calculateGood(files);

  // res.setHeader("Content-Disposition", `attachment; filename="cogs.xlsx"`);
  // res.setHeader(
  //   "Content-Type",
  //   "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  // );
  // res.end(xlsxBuffer);
}
