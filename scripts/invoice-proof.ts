import { mkdir, writeFile } from "node:fs/promises";
import { renderInvoicePdf } from "../src/modules/orders/invoices/renderer";
import { invoiceDocument } from "../tests/helpers/invoice";
async function main() {
  await mkdir("test-results/invoice-proof", { recursive: true });
  for (const locale of ["fa", "tr", "en"] as const) {
    const document = invoiceDocument(locale, 42);
    const pdf = await renderInvoicePdf(document, 2);
    await writeFile(`test-results/invoice-proof/${locale}.pdf`, pdf);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
