"use client";

import { useActionState, useMemo, useState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Button, Card, Input } from "@/components/ui";

type Locale = "fa" | "tr" | "en";
type Row = { key: string; defaults: Record<Locale, string> };
type ServerAction = (
  previous: ActionResult | null,
  data: FormData,
) => Promise<ActionResult>;
type Labels = Record<
  | "title"
  | "description"
  | "search"
  | "save"
  | "reset"
  | "export"
  | "import"
  | "importHelp"
  | "missing"
  | "noMissing"
  | "defaultValue"
  | "overrideValue",
  string
>;

export function TranslationEditor({
  rows,
  overrides,
  exportBundle,
  missing,
  saveAction,
  resetAction,
  importAction,
  labels,
}: {
  rows: Row[];
  overrides: Record<string, string>;
  exportBundle: unknown;
  missing: {
    entityType: string;
    entityId: string;
    locale: string;
    field: string;
  }[];
  saveAction: ServerAction;
  resetAction: ServerAction;
  importAction: ServerAction;
  labels: Labels;
}) {
  const [query, setQuery] = useState("");
  const [locale, setLocale] = useState<Locale>("fa");
  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.key.toLowerCase().includes(query.toLowerCase()) ||
          row.defaults[locale].toLowerCase().includes(query.toLowerCase()),
      ),
    [rows, query, locale],
  );
  function download() {
    const blob = new Blob([JSON.stringify(exportBundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hoda-ui-translations.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">{labels.title}</h1>
        <p className="mt-2 text-muted">{labels.description}</p>
      </div>
      <Card className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Input
            type="search"
            placeholder={labels.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-64 flex-1"
          />
          {(["fa", "tr", "en"] as Locale[]).map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={locale === item ? "primary" : "secondary"}
              onClick={() => setLocale(item)}
            >
              {item}
            </Button>
          ))}
          <Button type="button" variant="secondary" onClick={download}>
            {labels.export}
          </Button>
        </div>
      </Card>
      <div className="grid gap-3">
        {filtered.map((row) => (
          <TranslationRow
            key={`${locale}:${row.key}`}
            row={row}
            locale={locale}
            override={overrides[`${locale}:${row.key}`]}
            saveAction={saveAction}
            resetAction={resetAction}
            labels={labels}
          />
        ))}
      </div>
      <ImportForm action={importAction} labels={labels} />
      <Card>
        <h2 className="text-xl font-semibold">{labels.missing}</h2>
        {missing.length === 0 ? (
          <p className="mt-2 text-muted">{labels.noMissing}</p>
        ) : (
          <ul className="mt-3 grid gap-1">
            {missing.slice(0, 200).map((item, index) => (
              <li
                key={`${item.entityType}-${item.entityId}-${item.locale}-${index}`}
              >
                <bdi dir="ltr">
                  {item.entityType}:{item.entityId} · {item.field} ·{" "}
                  {item.locale}
                </bdi>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
function TranslationRow({
  row,
  locale,
  override,
  saveAction,
  resetAction,
  labels,
}: {
  row: Row;
  locale: Locale;
  override?: string;
  saveAction: ServerAction;
  resetAction: ServerAction;
  labels: Labels;
}) {
  const [saveState, saveForm, pending] = useActionState(saveAction, null);
  const [resetState, resetForm, resetPending] = useActionState(
    resetAction,
    null,
  );
  return (
    <Card data-testid={`translation-${row.key}`}>
      <code dir="ltr" className="block text-sm">
        {row.key}
      </code>
      <p className="mt-2 text-sm text-muted">
        {labels.defaultValue}: {row.defaults[locale]}
      </p>
      <form action={saveForm} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="key" value={row.key} />
        <label className="min-w-64 flex-1">
          {labels.overrideValue}
          <Input name="value" defaultValue={override ?? ""} />
        </label>
        <Button disabled={pending}>{labels.save}</Button>
        {saveState && !saveState.ok && (
          <span role="alert" className="text-error">
            {saveState.message}
          </span>
        )}
      </form>
      <form action={resetForm} className="mt-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="key" value={row.key} />
        <Button variant="secondary" size="sm" disabled={resetPending}>
          {labels.reset}
        </Button>
        {resetState && !resetState.ok && (
          <span role="alert" className="ms-2 text-error">
            {resetState.message}
          </span>
        )}
      </form>
    </Card>
  );
}
function ImportForm({
  action,
  labels,
}: {
  action: ServerAction;
  labels: Labels;
}) {
  const [state, form, pending] = useActionState(action, null);
  return (
    <Card>
      <h2 className="text-xl font-semibold">{labels.import}</h2>
      <p className="mt-2 text-sm text-muted">{labels.importHelp}</p>
      <form action={form} className="mt-3 grid gap-2">
        <textarea
          name="json"
          dir="ltr"
          required
          maxLength={1_000_000}
          rows={8}
          className="input h-auto font-mono"
        />
        <Button disabled={pending}>{labels.import}</Button>
        {state && !state.ok && (
          <p role="alert" className="text-error">
            {state.message}
          </p>
        )}
      </form>
    </Card>
  );
}
