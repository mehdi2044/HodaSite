import { test, devices } from "@playwright/test";
import { reconciliationBrowserFlows } from "./helpers/reconciliation-flow";
test.use({ ...devices["Pixel 7"], browserName: "chromium" });
test.describe("Chromium", reconciliationBrowserFlows);
