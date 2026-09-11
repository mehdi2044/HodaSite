import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import { invoiceHtml, type InvoiceSnapshot } from "./document";

export async function renderInvoicePdf(
  snapshot: InvoiceSnapshot,
  version: number,
  logo = "",
): Promise<Buffer> {
  const subsets = ["arabic", "latin", "latin-ext"];
  const ranges = [
    "U+0600-06FF,U+0750-077F,U+08A0-08FF,U+200C-200E,U+FB50-FDFF,U+FE70-FEFC",
    "U+0000-00FF,U+2000-206F",
    "U+0100-02FF",
  ];
  const fonts = (
    await Promise.all(
      subsets.map(async (subset, i) => {
        const bytes = await readFile(
          path.join(
            process.cwd(),
            "public/invoice-fonts",
            `${subset === "arabic" ? "vazirmatn" : "inter"}-${subset}-wght-normal.woff2`,
          ),
        );
        return `@font-face {font-family:Invoice; font-style:normal; font-weight:100 900; src:url(data:font/woff2;base64,${bytes.toString("base64")}) format('woff2'); unicode-range:${ranges[i]};}`;
      }),
    )
  ).join("\n");
  let browser: Browser | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    browser = await chromium.launch({
      executablePath: process.env.INVOICE_CHROMIUM_PATH || undefined,
      headless: true,
      timeout: 20000,
    });
    const context = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: "block",
      offline: true,
    });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    const work = async () => {
      await page.setContent(invoiceHtml(snapshot, version, fonts, logo), {
        waitUntil: "load",
        timeout: 15000,
      });
      await page.evaluate(() => document.fonts.ready);
      return page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        tagged: true,
      });
    };
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Invoice render timeout")),
          30000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    await browser?.close();
  }
}
