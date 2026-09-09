"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { normalizeUploadErrorCode } from "./media-uploader";

export function MediaReplaceUpload({
  mediaId,
  labels,
}: {
  mediaId: string;
  labels: {
    replace: string;
    replacing: string;
    accepted: string;
    failed: string;
  };
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<
    "idle" | "uploading" | "accepted" | "error"
  >("idle");
  const router = useRouter();
  async function upload(file: File | undefined) {
    if (!file) return;
    setState("uploading");
    const body = new FormData();
    body.set("file", file);
    const response = await fetch(
      `/api/uploads/${encodeURIComponent(mediaId)}/replace`,
      { method: "POST", body },
    );
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      normalizeUploadErrorCode(result.error);
      setState("error");
      return;
    }
    setState("accepted");
    router.refresh();
  }
  return (
    <div className="grid gap-2 border-t border-black/10 pt-3">
      <input
        ref={input}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      <Button
        type="button"
        variant="secondary"
        onClick={() => input.current?.click()}
        disabled={state === "uploading"}
      >
        {state === "uploading" ? labels.replacing : labels.replace}
      </Button>
      {state === "accepted" && (
        <p role="status" className="text-success">
          {labels.accepted}
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="text-error">
          {labels.failed}
        </p>
      )}
    </div>
  );
}
