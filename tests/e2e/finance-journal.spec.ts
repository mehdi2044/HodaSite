import { test, devices } from "@playwright/test";
import { journalBrowserFlows } from "./helpers/journal-flow";
test.use({ ...devices["Pixel 7"], browserName: "chromium" });
test.describe("Chromium", journalBrowserFlows);
