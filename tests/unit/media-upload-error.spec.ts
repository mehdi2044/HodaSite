import { describe, expect, it } from "vitest";
import { normalizeUploadErrorCode } from "@/components/admin/media-uploader";

describe("media upload error localization", () => {
  it("keeps known error codes", () => {
    expect(normalizeUploadErrorCode("invalid_size")).toBe("invalid_size");
    expect(normalizeUploadErrorCode("maintenance")).toBe("maintenance");
  });

  it("maps arbitrary or missing server values to the safe fallback", () => {
    expect(normalizeUploadErrorCode("unexpected_backend_detail")).toBe(
      "uploadFailed",
    );
    expect(normalizeUploadErrorCode(undefined)).toBe("uploadFailed");
  });
});
