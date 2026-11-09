import { describe, expect, it } from "vitest";
import {
  storefrontContact,
  storefrontSocialLink,
} from "@/lib/storefront-contact";
import { storefrontMenuHref } from "@/lib/storefront-path";
import { customerReturnPath } from "@/lib/customer-return-path";

describe("storefront navigation context", () => {
  it.each(["fa", "tr", "en"])(
    "pins local %s CMS links to the selected market",
    (locale) => {
      expect(
        storefrontMenuHref(
          "/fitting-room?market=IR#instant-gallery",
          locale,
          "CA",
        ),
      ).toBe(`/${locale}/fitting-room?market=CA#instant-gallery`);
      expect(storefrontMenuHref("/", locale, "CA")).toBe(`/${locale}/m/CA`);
      expect(
        storefrontMenuHref(`/${locale}/p/item?color=blue`, locale, "CA"),
      ).toBe(`/${locale}/m/CA/p/item?color=blue`);
      expect(
        storefrontMenuHref("https://example.net/fitting-room", locale, "CA"),
      ).toBe("https://example.net/fitting-room");
      expect(
        storefrontMenuHref("/\\example.net", locale, "CA"),
      ).toBeUndefined();
    },
  );

  it("retains the current market on safe login returns without accepting arbitrary parameters", () => {
    expect(customerReturnPath("/fa/fitting-room?market=CA", "fa", "CA")).toBe(
      "/fa/fitting-room?market=CA",
    );
    expect(customerReturnPath("/fa/checkout?market=IR", "fa", "CA")).toBe(
      "/fa/checkout?market=CA",
    );
    expect(
      customerReturnPath(
        "/fa/fitting-room?market=CA&next=//example.net",
        "fa",
        "CA",
      ),
    ).toBe("/fa/account?market=CA");
  });
});

describe("public market contact", () => {
  it("omits seeded data and never uses a global address for a market", () => {
    expect(
      storefrontContact(
        {},
        { email: "hello@example.com", phones: { CA: "+1 416 000 0000" } },
        "CA",
        "fa",
      ),
    ).toEqual({ email: "", phone: "", address: "" });
    expect(
      storefrontSocialLink("https://instagram.com/stylehub", "CA", "instagram"),
    ).toBeUndefined();
  });

  it("uses market contact values and the requested translation", () => {
    const support = {
      email: "support@shop.invalid",
      phone: "+1 555 010 0123",
      addressFa: "نشانی آزمایشی کانادا",
    };
    expect(storefrontContact(support, {}, "CA", "fa")).toEqual({
      email: support.email,
      phone: support.phone,
      address: support.addressFa,
    });
    expect(storefrontContact(support, {}, "CA", "tr").address).toBe("");
  });
});
