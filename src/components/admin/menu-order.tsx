"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { reorderMenuItems } from "@/app/admin/(dashboard)/content/menus/actions";

export function MenuOrder({
  menuId,
  parentId,
  items,
  labels,
}: {
  menuId: string;
  parentId?: string;
  items: { id: string; label: string }[];
  labels: {
    help: string;
    up: string;
    down: string;
    save: string;
    saved: string;
  };
}) {
  const [ordered, setOrdered] = useState(items);
  const [dragged, setDragged] = useState<string | null>(null);
  const [state, action, pending] = useActionState(reorderMenuItems, null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= ordered.length) return;
    const next = [...ordered];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrdered(next);
  };
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="menuId" value={menuId} />
      <input type="hidden" name="parentId" value={parentId ?? ""} />
      <input
        type="hidden"
        name="orderedIds"
        value={JSON.stringify(ordered.map((item) => item.id))}
      />
      <p className="text-sm text-muted">{labels.help}</p>
      {ordered.map((item, index) => (
        <div
          draggable
          key={item.id}
          onDragStart={() => setDragged(item.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            const from = ordered.findIndex(
              (candidate) => candidate.id === dragged,
            );
            if (from >= 0) move(from, index);
            setDragged(null);
          }}
          className="flex min-h-11 items-center justify-between rounded-token border border-black/10 bg-surface px-3"
        >
          <span>{item.label}</span>
          <span className="flex gap-1">
            <button
              type="button"
              className="min-h-11 min-w-11"
              aria-label={labels.up}
              onClick={() => move(index, index - 1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="min-h-11 min-w-11"
              aria-label={labels.down}
              onClick={() => move(index, index + 1)}
            >
              ↓
            </button>
          </span>
        </div>
      ))}
      {state && !state.ok && (
        <p role="alert" className="text-error">
          {state.message}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-success">
          {labels.saved}
        </p>
      )}
      <Button disabled={pending} variant="secondary">
        {labels.save}
      </Button>
    </form>
  );
}
