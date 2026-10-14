import { expect, it } from "vitest";
import {
  menuPresentationSchema,
  menuPresentation,
} from "@/modules/content/menu-presentation";
import { brandLogoWidth } from "@/lib/brand";

it("bounds menu framing and restricts CSS tone/media identity", () => {
  for (const raw of [
    { focalX: -0.01 },
    { focalY: 1.01 },
    { tone: "sand);}</style><script>" },
    { mediaId: "https://example.com/image.svg" },
    { fit: "url(https://example.com)" },
  ])
    expect(menuPresentationSchema.safeParse(raw).success).toBe(false);
  expect(menuPresentation(null).mediaId).toBeUndefined();
  expect(
    menuPresentationSchema.parse({
      focalX: 0,
      focalY: 1,
      fit: "contain",
      tone: "kidsPink",
    }),
  ).toMatchObject({ focalX: 0, focalY: 1 });
});
it("never interpolates arbitrary persisted logo sizing", () => {
  for (const raw of [
    { logoWidth: "160px}</style>" },
    { logoWidth: Infinity },
    { logoWidth: 79 },
    { logoWidth: 241 },
    null,
  ])
    expect(brandLogoWidth(raw)).toBe(160);
  expect(brandLogoWidth({ logoWidth: 80 })).toBe(80);
  expect(brandLogoWidth({ logoWidth: 240 })).toBe(240);
});
