import { test, devices } from "@playwright/test";
import { journalBrowserFlows } from "./helpers/journal-flow";
test.use({ ...devices["iPhone 13"], browserName: "webkit" });
test.describe("WebKit", journalBrowserFlows);
