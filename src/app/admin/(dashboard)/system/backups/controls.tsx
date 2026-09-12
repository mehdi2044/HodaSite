"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { backupAction, backupSettingsAction } from "./actions";
import { CHUNK_BYTES } from "@/modules/backups/validation";
export function RefreshBackups() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
export function BackupButton({
  type,
  backupId,
}: {
  type: "BACKUP" | "VERIFY" | "EXPORT";
  backupId?: string;
}) {
  const t = useTranslations("backups");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <div>
      <button
        className="button min-h-11"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await backupAction(
              type === "BACKUP"
                ? { type, requestKey: crypto.randomUUID(), includeMedia: true }
                : { type, requestKey: crypto.randomUUID(), backupId },
            );
            setMessage(result.error ? "failed" : "queued");
          })
        }
      >
        {t(type)}
      </button>
      <span role="status">{message ? t(message) : ""}</span>
    </div>
  );
}
export function RestoreControl({
  backupId,
  uploadId,
}: {
  backupId?: string;
  uploadId?: string;
}) {
  const t = useTranslations("backups");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <details className="mt-3">
      <summary className="cursor-pointer py-3">{t("RESTORE")}</summary>
      <form
        className="grid gap-3 mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          start(async () => {
            const result = await backupAction({
              type: "RESTORE",
              requestKey: crypto.randomUUID(),
              ...(backupId ? { backupId } : { uploadId }),
              mode: data.get("mode"),
              password: data.get("password"),
              token: data.get("token"),
              confirmed: data.get("confirmed") === "on",
            });
            form.reset();
            setMessage(result.error ? "failed" : "queued");
          });
        }}
      >
        <p className="text-error">{t("restoreWarning")}</p>
        <label>
          {t("mode")}
          <select name="mode" className="input">
            <option value="FULL">{t("full")}</option>
            <option value="DB_ONLY">{t("dbOnly")}</option>
            <option value="MEDIA_ONLY">{t("mediaOnly")}</option>
          </select>
        </label>
        <label>
          {t("password")}
          <input
            className="input"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
          />
        </label>
        <label>
          {t("token")}
          <input
            className="input"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
          />
        </label>
        <label className="flex items-center gap-2 min-h-11">
          <input type="checkbox" name="confirmed" required />
          {t("confirm")}
        </label>
        <button className="button min-h-11" disabled={pending}>
          {t("RESTORE")}
        </button>
        <p role="status">{message ? t(message) : ""}</p>
      </form>
    </details>
  );
}
export function UploadBackup() {
  const t = useTranslations("backups");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  return (
    <form
      className="grid gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const file = new FormData(event.currentTarget).get("file");
        if (!(file instanceof File)) return;
        setBusy(true);
        setMessage("");
        setProgress(0);
        try {
          const response = await fetch("/api/admin/backups/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: file.name, bytes: file.size }),
          });
          if (!response.ok) throw Error();
          const { id } = await response.json();
          for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
            const chunk = await fetch(
              `/api/admin/backups/upload?id=${encodeURIComponent(id)}&offset=${offset}`,
              {
                method: "POST",
                body: file.slice(offset, offset + CHUNK_BYTES),
              },
            );
            if (!chunk.ok) throw Error();
            setProgress(
              Math.round(
                (Math.min(offset + CHUNK_BYTES, file.size) / file.size) * 100,
              ),
            );
          }
          setMessage("queued");
          router.refresh();
        } catch {
          setMessage("failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        {t("upload")}
        <input
          className="input"
          type="file"
          name="file"
          accept=".zip"
          required
          disabled={busy}
        />
      </label>
      <button className="button min-h-11" disabled={busy}>
        {t("upload")}
      </button>
      {busy && (
        <progress
          className="w-full"
          value={progress}
          max={100}
          aria-label={t("upload")}
        />
      )}
      <p role="status">{message ? t(message) : ""}</p>
    </form>
  );
}
export function BackupSettingsForm({
  settings,
}: {
  settings: {
    enabled: boolean;
    hourUtc: number;
    minuteUtc: number;
    includeMedia: boolean;
    keepDaily: number;
    keepWeekly: number;
    keepMonthly: number;
    verifyWeekday: number;
  };
}) {
  const t = useTranslations("backups");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        start(async () => {
          const result = await backupSettingsAction({
            enabled: data.get("enabled") === "on",
            includeMedia: data.get("includeMedia") === "on",
            ...Object.fromEntries(
              [
                "hourUtc",
                "minuteUtc",
                "keepDaily",
                "keepWeekly",
                "keepMonthly",
                "verifyWeekday",
              ].map((k) => [k, Number(data.get(k))]),
            ),
          });
          setMessage(result.error ? "failed" : "saved");
        });
      }}
    >
      {(["enabled", "includeMedia"] as const).map((k) => (
        <label key={k} className="flex items-center gap-2 min-h-11">
          <input type="checkbox" name={k} defaultChecked={settings[k]} />
          {t(k)}
        </label>
      ))}
      {(
        [
          "hourUtc",
          "minuteUtc",
          "keepDaily",
          "keepWeekly",
          "keepMonthly",
          "verifyWeekday",
        ] as const
      ).map((k) => (
        <label key={k}>
          {t(k)}
          <input
            className="input"
            type="number"
            name={k}
            defaultValue={settings[k]}
            min={k === "keepDaily" ? 1 : 0}
            max={
              k === "minuteUtc"
                ? 59
                : k === "hourUtc"
                  ? 23
                  : k === "verifyWeekday"
                    ? 6
                    : k === "keepDaily"
                      ? 365
                      : k === "keepWeekly"
                        ? 104
                        : 120
            }
            required
          />
        </label>
      ))}
      <button className="button min-h-11" disabled={pending}>
        {t("save")}
      </button>
      <p role="status">{message ? t(message) : ""}</p>
    </form>
  );
}
