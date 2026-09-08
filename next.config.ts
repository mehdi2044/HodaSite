import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const config: NextConfig = {
  output: "standalone",
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  // sharp ships a native binary; Next's standalone output-file-tracing can
  // fail to detect it through sharp's dynamic require()-based platform
  // resolution. serverExternalPackages copies the whole package into the
  // standalone bundle instead of trace-analyzing it (Phase 01b, D21 worker).
  serverExternalPackages: ["sharp"],
};

export default withNextIntl(config);
