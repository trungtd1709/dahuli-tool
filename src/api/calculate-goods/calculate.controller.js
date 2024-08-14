import * as calculateService from "./calculate.service.js";

export async function calculateSku(req, res) {
  const { user, query } = req;
  const files = req.files;
  // const result = calculateService.testService;
  console.log("[files.length]: ", files);
  res.json({ message: "success" });
}
