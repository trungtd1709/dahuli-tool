import * as calculateService from "./calculate.service.js";

export async function calculateSku(req, res) {
  const { files } = req;
  
  const xlsxBuffer = await calculateService.calculateGood(files);
  res.setHeader("Content-Disposition", 'attachment; filename="cogs.xlsx"');
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.end(xlsxBuffer);

  // console.log("[files.length]: ", files);
  // res.json({ message: "success" });
}
