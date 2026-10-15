import { test, devices } from "@playwright/test";
import { registerUnsavedHistoryTests } from "./helpers/unsaved-history-flow";
test.use({ ...devices["Desktop Safari"], browserName: "webkit" });
registerUnsavedHistoryTests("webkit");
