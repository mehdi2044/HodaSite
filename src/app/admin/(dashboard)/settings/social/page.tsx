import { getSiteSettings } from "@/modules/settings";
import { normalizeSocial } from "@/lib/social";
import { SocialEditor } from "./social-editor";

export default async function SocialSettings() {
  const site = await getSiteSettings();
  // Accepts the pre-review flat shape too (backward-compat safety net —
  // PR #4 review, P2).
  const social = normalizeSocial(site?.social);

  return (
    <>
      <h1 className="text-2xl font-semibold">شبکه‌های اجتماعی</h1>
      <p className="mt-1 text-sm text-muted">
        به تفکیک هر بازار. خالی بگذارید تا آن شبکه در فوتر آن بازار نمایش داده
        نشود.
      </p>
      <div className="mt-4 max-w-lg">
        <SocialEditor initial={social} />
      </div>
    </>
  );
}
