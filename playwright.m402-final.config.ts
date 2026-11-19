import { defineConfig } from "@playwright/test";
import recovery from "./playwright.m402-recovery.config";

export default defineConfig(recovery, {
  testMatch: [
    "m402-v32-recovery.spec.ts",
    "m402-final-interaction.spec.ts",
    "m402-native-locale.spec.ts",
  ],
  workers: 1,
});
