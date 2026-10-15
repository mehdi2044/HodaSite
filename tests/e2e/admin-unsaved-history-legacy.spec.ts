import { test } from "@playwright/test";
import { registerUnsavedHistoryTests } from "./helpers/unsaved-history-flow";
test.use({
  browserName: "chromium",
  isMobile: false,
  hasTouch: false,
  deviceScaleFactor: 1,
});
registerUnsavedHistoryTests("chromium", true);
