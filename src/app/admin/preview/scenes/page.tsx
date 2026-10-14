import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { NextIntlClientProvider } from "next-intl";
import { getRuntimeMessages } from "@/modules/content";
import { ScenePreviewClient } from "./preview-client";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const parameters = z.object({
  channel: z.string().min(1).max(100),
  scopeMarketId: id.optional(),
  marketId: id,
  locale: z.enum(["fa", "tr", "en"]),
  frame: z.enum(["mobile", "desktop"]),
});
export default async function ScenePreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");
  const parsed = parameters.safeParse(await searchParams);
  if (!parsed.success) notFound();
  const input = parsed.data;
  const scope = input.scopeMarketId
    ? { marketId: input.scopeMarketId }
    : undefined;
  if (
    !(await can(session.user.id, "content.homepage.read", scope)) ||
    (input.scopeMarketId && input.scopeMarketId !== input.marketId)
  )
    notFound();
  if (
    !(await db.market.count({
      where: {
        id: input.marketId,
        isActive: true,
        enabledLocales: { has: input.locale },
      },
    }))
  )
    notFound();
  const messages = await getRuntimeMessages(input.locale);
  return (
    <NextIntlClientProvider locale={input.locale} messages={messages}>
      <ScenePreviewClient
        channel={input.channel}
        scopeMarketId={input.scopeMarketId ?? null}
        marketId={input.marketId}
        locale={input.locale}
        frame={input.frame}
      />
    </NextIntlClientProvider>
  );
}
