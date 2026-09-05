"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

type UploadState = {
  name: string;
  status: "uploading" | "done" | "error";
  error?: string;
};

const ERROR_FA: Record<string, string> = {
  invalid_size: "حجم فایل مجاز نیست.",
  unsupported_media_type: "نوع فایل پشتیبانی نمی‌شود.",
  corrupt_file: "فایل تصویری خراب است.",
  dimensions_too_large: "ابعاد تصویر بیش از حد مجاز است.",
  maintenance: "سایت موقتاً در حالت تعمیرات است.",
  forbidden: "اجازهٔ آپلود ندارید.",
};

async function uploadOne(file: File): Promise<void> {
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(ERROR_FA[body.error ?? ""] ?? "آپلود ناموفق بود.");
  }
}

/** Drag & drop multi-upload with per-file progress (Phase 01b §3). */
export function MediaUploader() {
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploads(list.map((f) => ({ name: f.name, status: "uploading" })));
    await Promise.all(
      list.map(async (file, i) => {
        try {
          await uploadOne(file);
          setUploads((prev) =>
            prev.map((u, j) => (j === i ? { ...u, status: "done" } : u)),
          );
        } catch (err) {
          setUploads((prev) =>
            prev.map((u, j) =>
              j === i
                ? { ...u, status: "error", error: (err as Error).message }
                : u,
            ),
          );
        }
      }),
    );
    router.refresh();
  }

  return (
    <div className="mt-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-token border-2 border-dashed p-8 text-center text-sm text-muted transition",
          dragging ? "border-primary bg-primary/5" : "border-black/15",
        )}
      >
        تصاویر را اینجا رها کنید یا کلیک کنید تا انتخاب کنید (چند فایل هم‌زمان)
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif,application/pdf"
          multiple
          hidden
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>
      {uploads.length > 0 && (
        <ul className="mt-2 grid gap-1 text-sm">
          {uploads.map((u, i) => (
            <li
              key={i}
              className={cn(
                u.status === "error" && "text-error",
                u.status === "done" && "text-success",
              )}
            >
              {u.name} —{" "}
              {u.status === "uploading"
                ? "در حال آپلود…"
                : u.status === "done"
                  ? "آپلود شد"
                  : u.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
