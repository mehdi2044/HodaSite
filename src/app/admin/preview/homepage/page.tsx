import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { NextIntlClientProvider } from "next-intl";
import { auth } from "@/modules/auth";
import { readHomepagePreview } from "@/modules/content/private-homepage-preview";
import { getRuntimeMessages } from "@/modules/content";
import { HomepageBlocks } from "@/components/storefront/homepage-blocks";
import { PrivateHomepageFrame } from "./preview-frame";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function HomepagePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");
  const channel = z.uuid().safeParse((await searchParams).channel);
  if (!channel.success) notFound();
  const preview = await readHomepagePreview(
    session.user.id,
    channel.data,
  ).catch(() => null);
  if (!preview) notFound();
  const messages = await getRuntimeMessages(preview.locale);
  return (
    <NextIntlClientProvider locale={preview.locale} messages={messages}>
      <PrivateHomepageFrame
        channel={channel.data}
        sequence={preview.sequence}
        locale={preview.locale}
      >
        <HomepageBlocks
          blocks={preview.blocks}
          locale={preview.locale}
          market={preview.market}
          preview
        />
      </PrivateHomepageFrame>
    </NextIntlClientProvider>
  );
}
