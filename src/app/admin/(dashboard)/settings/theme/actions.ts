"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { lockMediaReferences } from "@/modules/media/reference-lock";
import { runAction, type ActionResult } from "@/lib/action-result";
import { sanitizeCustomCss } from "@/lib/custom-css";
import {
  COLOR_KEYS,
  DEFAULT_LIGHT_COLORS,
  DEFAULT_DARK_COLORS,
} from "@/lib/theme-defaults";
import {
  cssLength,
  hexColor,
  HERO_STYLES,
  FONT_FA_FAMILIES,
  FONT_LATIN_FAMILIES,
  FONT_PRICE_FAMILIES,
  BUTTON_STYLES,
  lineOpacity,
} from "@/lib/theme-validation";

const shape: Record<string, z.ZodTypeAny> = {
  radius: cssLength,
  darkMode: z.enum(["off", "on", "system"]),
  headerStyle: z.enum(["minimal", "centered", "editorial"]),
  buttonStyle: z.enum(BUTTON_STYLES),
  heroStyle: z.enum(HERO_STYLES),
  fontFa: z.enum(FONT_FA_FAMILIES),
  fontLatin: z.enum(FONT_LATIN_FAMILIES),
  fontHeadingLatin: z.enum(FONT_LATIN_FAMILIES).default("Manrope"),
  fontPriceLatin: z.enum(FONT_PRICE_FAMILIES).default("Inter"),
  lineOpacity: lineOpacity.default(0.12),
  customCss: z.string().optional().default(""),
};
for (const key of COLOR_KEYS) {
  // Old clients still submit the original palette: newly added tokens have
  // safe defaults rather than making their existing saves invalid.
  const legacy = [
    "primary",
    "background",
    "surface",
    "text",
    "muted",
    "success",
    "error",
    "warning",
  ].includes(key);
  shape[`light_${key}`] = legacy
    ? hexColor
    : hexColor.default(DEFAULT_LIGHT_COLORS[key]);
  shape[`dark_${key}`] = legacy
    ? hexColor
    : hexColor.default(DEFAULT_DARK_COLORS[key]);
}
const schema = z.object(shape);

export async function saveTheme(
  _prev: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "settings.theme.edit");
    const userId = session.user.id;

    const parsed = schema.parse(Object.fromEntries(data)) as Record<
      string,
      string
    >;
    const light = Object.fromEntries(
      COLOR_KEYS.map((k) => [k, parsed[`light_${k}`]]),
    );
    const dark = Object.fromEntries(
      COLOR_KEYS.map((k) => [k, parsed[`dark_${k}`]]),
    );
    const colors = {
      light,
      dark,
      opacity: { line: Number(parsed.lineOpacity) },
    };
    const fonts = {
      fa: parsed.fontFa,
      latin: parsed.fontLatin,
      headingLatin: parsed.fontHeadingLatin,
      priceLatin: parsed.fontPriceLatin,
    };
    const customCss = sanitizeCustomCss(parsed.customCss ?? "");
    const accountMediaId = data.has("accountMediaId")
      ? z
          .string()
          .regex(/^[A-Za-z0-9_-]{0,100}$/)
          .parse(data.get("accountMediaId")) || null
      : undefined;

    await withMutation(async () => {
      await db.$transaction(async (tx) => {
        await lockMediaReferences(tx, [accountMediaId], { readyImages: true });
        await assertCan(userId, "settings.theme.edit");
        const current = await tx.themeSettings.findUniqueOrThrow({
          where: { id: "default" },
        });
        await tx.themeSettings.update({
          where: { id: "default" },
          data: {
            colors,
            fonts,
            radius: parsed.radius,
            darkMode: parsed.darkMode,
            headerStyle: parsed.headerStyle,
            buttonStyle: parsed.buttonStyle,
            heroStyle: parsed.heroStyle,
            customCss: customCss || null,
            ...(accountMediaId !== undefined ? { accountMediaId } : {}),
          },
        });
        await tx.auditLog.create({
          data: {
            userId,
            action: "settings.theme.update",
            entityType: "ThemeSettings",
            entityId: "default",
            before: {
              colors: current.colors,
              fonts: current.fonts,
              radius: current.radius,
              darkMode: current.darkMode,
              headerStyle: current.headerStyle,
              buttonStyle: current.buttonStyle,
              heroStyle: current.heroStyle,
              customCss: current.customCss,
              accountMediaId: current.accountMediaId,
            } as object,
            after: {
              colors,
              fonts,
              radius: parsed.radius,
              darkMode: parsed.darkMode,
              headerStyle: parsed.headerStyle,
              buttonStyle: parsed.buttonStyle,
              heroStyle: parsed.heroStyle,
              customCss,
              accountMediaId:
                accountMediaId === undefined
                  ? current.accountMediaId
                  : accountMediaId,
            },
          },
        });
      });
    });

    revalidateTag("theme");
  });
}
