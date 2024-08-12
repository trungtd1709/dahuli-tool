import * as calculateService from "./calculate.service.js";

export async function calculateSku(req, res) {
  const { user, query } = req;
  // const result = await invoiceService.listAllInvoice(
  //     companyId,
  //     accountId,
  //     accountLevel,
  //     isAdmin,
  //     query
  // );
  const result = calculateService.testService;
  res.json({ message: "success" });
}
