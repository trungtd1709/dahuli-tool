import * as calculateService from "./calculate.service.js";

export async function calculateSku(req, res) {
  const { files } = req;

  const { xlsxBuffer, shipment, shipmentId } =
    await calculateService.calculateGood(files);
    // const xlsxBuffer = await calculateService.calculateGood(files);z

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${shipment ?? shipmentId}.xlsx"`
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.end(xlsxBuffer);
}
