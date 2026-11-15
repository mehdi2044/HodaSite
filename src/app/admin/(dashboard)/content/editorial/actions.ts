"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { UnauthorizedError } from "@/modules/access";
import { runAction, type ActionResult } from "@/lib/action-result";
import {
  editorialId,
  istanbulTime,
  readJson,
} from "@/modules/editorial/contracts";
import {
  archiveEditorial,
  publishEditorial,
  saveEditorialDraft,
} from "@/modules/editorial/publication";

const version = z.coerce.number().int().min(0).max(2147483646);

async function userId() {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  return session.user.id;
}

export async function writeEditorial(
  _prev: ActionResult | null,
  form: FormData,
) {
  let href: string | undefined;
  const result = await runAction(async () => {
    const id = editorialId.optional().parse(form.get("id") || undefined);
    const entry = await saveEditorialDraft(await userId(), {
      id,
      version: version.parse(form.get("version")),
      slugs: {
        fa: form.get("slug-fa"),
        tr: form.get("slug-tr"),
        en: form.get("slug-en"),
      },
      body: readJson(form.get("body")),
    });
    href = `/admin/content/editorial/${entry.id}`;
  });
  if (href) {
    revalidatePath(href);
    redirect(href);
  }
  return result;
}

export async function changeEditorial(
  _prev: ActionResult | null,
  form: FormData,
) {
  return runAction(async () => {
    const user = await userId();
    const id = editorialId.parse(form.get("id"));
    const expectedVersion = version.parse(form.get("version"));
    if (form.get("operation") === "archive") {
      await archiveEditorial(user, id, expectedVersion);
    } else {
      await publishEditorial(user, {
        id,
        version: expectedVersion,
        revisionId: editorialId.parse(form.get("revisionId")),
        date: form.get("date")
          ? istanbulTime.parse(form.get("date"))
          : undefined,
      });
    }
    revalidatePath(`/admin/content/editorial/${id}`);
  });
}
