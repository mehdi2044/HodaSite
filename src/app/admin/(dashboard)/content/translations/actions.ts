"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { assertCan, UnauthorizedError } from "@/modules/access";
import { db } from "@/lib/db";
import { withMutation } from "@/lib/mutation-gate";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  parseTranslationImport,
  uiTranslationSchema,
  UI_LOCALES,
} from "@/modules/content/translations";

export async function saveUiTranslation(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "content.translation.write");
    const input = uiTranslationSchema.parse({
      locale: data.get("locale"),
      key: data.get("key"),
      value: data.get("value"),
    });
    const before = await db.translation.findUnique({
      where: {
        entityType_entityId_field_locale: {
          entityType: "ui",
          entityId: "global",
          field: input.key,
          locale: input.locale,
        },
      },
    });
    await withMutation(() =>
      db.$transaction(async (tx) => {
        const saved = await tx.translation.upsert({
          where: {
            entityType_entityId_field_locale: {
              entityType: "ui",
              entityId: "global",
              field: input.key,
              locale: input.locale,
            },
          },
          update: { value: input.value },
          create: {
            entityType: "ui",
            entityId: "global",
            field: input.key,
            locale: input.locale,
            value: input.value,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: "content.translation.update",
            entityType: "Translation",
            entityId: saved.id,
            before: before as object | undefined,
            after: saved as object,
          },
        });
      }),
    );
    invalidate(input.locale);
  });
}

export async function resetUiTranslation(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "content.translation.write");
    const input = uiTranslationSchema
      .pick({ locale: true, key: true })
      .parse({ locale: data.get("locale"), key: data.get("key") });
    const before = await db.translation.findUnique({
      where: {
        entityType_entityId_field_locale: {
          entityType: "ui",
          entityId: "global",
          field: input.key,
          locale: input.locale,
        },
      },
    });
    await withMutation(() =>
      db.$transaction(async (tx) => {
        if (before) await tx.translation.delete({ where: { id: before.id } });
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: "content.translation.reset",
            entityType: "Translation",
            entityId: before?.id ?? `${input.locale}:${input.key}`,
            before: before as object | undefined,
          },
        });
      }),
    );
    invalidate(input.locale);
  });
}

export async function importUiTranslations(
  _previous: ActionResult | null,
  data: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await auth();
    if (!session?.user?.id) throw new UnauthorizedError();
    await assertCan(session.user.id, "content.translation.write");
    const bundle = parseTranslationImport(z.string().parse(data.get("json")));
    const entries = Object.entries(bundle).flatMap(([locale, values]) =>
      Object.entries(values ?? {}).map(([key, value]) => ({
        locale,
        key,
        value,
      })),
    );
    await withMutation(() =>
      db.$transaction(async (tx) => {
        for (const entry of entries)
          await tx.translation.upsert({
            where: {
              entityType_entityId_field_locale: {
                entityType: "ui",
                entityId: "global",
                field: entry.key,
                locale: entry.locale,
              },
            },
            update: { value: entry.value },
            create: {
              entityType: "ui",
              entityId: "global",
              field: entry.key,
              locale: entry.locale,
              value: entry.value,
            },
          });
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: "content.translation.import",
            entityType: "Translation",
            entityId: "ui:global",
            after: { count: entries.length, locales: Object.keys(bundle) },
          },
        });
      }),
    );
    for (const locale of UI_LOCALES) if (bundle[locale]) invalidate(locale);
  });
}

function invalidate(locale: string) {
  revalidateTag("ui-translations");
  revalidateTag(`ui-translations:${locale}`);
  revalidatePath("/admin/content/translations");
  revalidatePath("/fa");
  revalidatePath("/tr");
  revalidatePath("/en");
}
