"use client";
import { createContext, useCallback, useState } from "react";

export const MediaPickerPendingContext = createContext<
  (id: string, pending: boolean) => void
>(() => {});

/** Separate registrations keep one picker from releasing another pending upload. */
export function useMediaPickerPending() {
  const [uploads, setUploads] = useState<Set<string>>(() => new Set());
  const reportPending = useCallback((id: string, pending: boolean) => {
    setUploads((previous) => {
      if (previous.has(id) === pending) return previous;
      const next = new Set(previous);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  return { uploadsPending: uploads.size > 0, reportPending };
}
