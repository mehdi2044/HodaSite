import { test, devices } from "@playwright/test";
import { reconciliationBrowserFlows } from "./helpers/reconciliation-flow";
test.use({ ...devices["iPhone 13"], browserName: "webkit" });
test.describe("WebKit", reconciliationBrowserFlows);
