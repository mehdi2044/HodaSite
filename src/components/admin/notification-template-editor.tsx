"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/action-result";
import { Button } from "@/components/ui";

type Labels = Record<
  | "active"
  | "subject"
  | "body"
  | "variables"
  | "save"
  | "testTitle"
  | "recipient"
  | "locale"
  | "sendTest"
  | "success",
  string
>;

export function NotificationTemplateEditor({
  template,
  variables,
  labels,
  saveAction,
  testAction,
}: {
  template: {
    id: string;
    key: string;
    isActive: boolean;
    subjectI18n: Record<string, string>;
    bodyI18n: Record<string, string>;
  };
  variables: readonly string[];
  labels: Labels;
  saveAction: (
    state: ActionResult | null,
    data: FormData,
  ) => Promise<ActionResult>;
  testAction: (
    state: ActionResult | null,
    data: FormData,
  ) => Promise<ActionResult>;
}) {
  const [saveState, saveFormAction, saving] = useActionState(saveAction, null);
  const [testState, testFormAction, testing] = useActionState(testAction, null);
  return (
    <article className="rounded-token border border-black/10 bg-surface p-5">
      <h2 dir="ltr" className="font-semibold">
        <bdi dir="ltr">{template.key}</bdi>
      </h2>
      <p className="mt-2 text-sm text-muted">
        {labels.variables}: {variables.map((v) => `{{${v}}}`).join(", ")}
      </p>
      <form action={saveFormAction} className="mt-4 grid gap-4">
        <input type="hidden" name="id" value={template.id} />
        <input type="hidden" name="key" value={template.key} />
        <label className="flex min-h-11 items-center gap-2">
          <input
            name="isActive"
            type="checkbox"
            defaultChecked={template.isActive}
          />
          {labels.active}
        </label>
        {(["fa", "tr", "en"] as const).map((locale) => (
          <fieldset
            key={locale}
            className="grid gap-2 rounded-token border border-black/10 p-3"
          >
            <legend className="px-2 font-medium">{locale}</legend>
            <label className="grid gap-1 text-sm">
              {labels.subject}
              <input
                name={`subject${locale[0].toUpperCase()}${locale.slice(1)}`}
                defaultValue={template.subjectI18n[locale]}
                dir={locale === "fa" ? "rtl" : "ltr"}
                required
                className="min-h-11 rounded-[8px] border border-black/15 px-3"
              />
            </label>
            <label className="grid gap-1 text-sm">
              {labels.body}
              <textarea
                name={`body${locale[0].toUpperCase()}${locale.slice(1)}`}
                defaultValue={template.bodyI18n[locale]}
                dir={locale === "fa" ? "rtl" : "ltr"}
                required
                rows={5}
                className="rounded-[8px] border border-black/15 p-3"
              />
            </label>
          </fieldset>
        ))}
        <Button disabled={saving} type="submit">
          {labels.save}
        </Button>
        {saveState && (
          <p
            role="status"
            className={saveState.ok ? "text-success" : "text-error"}
          >
            {saveState.ok ? labels.success : saveState.message}
          </p>
        )}
      </form>
      <form
        action={testFormAction}
        className="mt-5 grid gap-3 border-t border-black/10 pt-4 sm:grid-cols-3"
      >
        <input type="hidden" name="id" value={template.id} />
        <strong className="sm:col-span-3">{labels.testTitle}</strong>
        <label className="grid gap-1 text-sm">
          {labels.recipient}
          <input
            name="recipient"
            type="email"
            required
            className="min-h-11 rounded-[8px] border border-black/15 px-3"
          />
        </label>
        <label className="grid gap-1 text-sm">
          {labels.locale}
          <select
            name="locale"
            className="min-h-11 rounded-[8px] border border-black/15 px-3"
          >
            <option value="fa">fa</option>
            <option value="tr">tr</option>
            <option value="en">en</option>
          </select>
        </label>
        <Button disabled={testing} type="submit" variant="secondary">
          {labels.sendTest}
        </Button>
        {testState && (
          <p
            role="status"
            className={testState.ok ? "text-success" : "text-error"}
          >
            {testState.ok ? labels.success : testState.message}
          </p>
        )}
      </form>
    </article>
  );
}
