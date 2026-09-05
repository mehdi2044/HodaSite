"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";
import { sanitizeCustomCss } from "@/lib/custom-css";
import { COLOR_KEYS } from "@/lib/theme-defaults";
import {
  cssLength,
  hexColor,
  HERO_STYLES,
  FONT_FA_FAMILIES,
  FONT_LATIN_FAMILIES,
} from "@/lib/theme-validation";

const shape: Record<string, z.ZodTypeAny> = {
  radius: cssLength,
  darkMode: z.enum(["off", "on", "system"]),
  headerStyle: z.enum(["minimal", "centered", "editorial"]),
  buttonStyle: z.enum(["pill", "soft", "sharp"]),
  heroStyle: z.enum(HERO_STYLES),
  fontFa: z.enum(FONT_FA_FAMILIES),
  fontLatin: z.enum(FONT_LATIN_FAMILIES),
  customCss: z.string().optional().default(""),
};
for (const key of COLOR_KEYS) {
  shape[`light_${key}`] = hexColor;
  shape[`dark_${key}`] = hexColor;
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
    const colors = { light, dark };
    const fonts = { fa: parsed.fontFa, latin: parsed.fontLatin };
    const customCss = sanitizeCustomCss(parsed.customCss ?? "");

    await withMutation(async () => {
      const current = await db.themeSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      await db.$transaction([
        db.themeSettings.update({
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
          },
        }),
        db.auditLog.create({
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
            },
          },
        }),
      ]);
    });

    revalidateTag("theme");
  });
}
