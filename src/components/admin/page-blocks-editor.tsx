"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MediaPicker } from "@/components/admin/media-picker";
import { Button, Input } from "@/components/ui";
import {
  buildSafePagePreview,
  CONTENT_BLOCK_TYPES,
  createEmptyContentBlock,
  serializeContentBlocks,
  type ContentBlockType,
  type EditorLocale,
  type PreviewMediaUrls,
} from "@/modules/content/editor";
import type { ContentBlock } from "@/modules/content";
import {
  applyRichTextCommand,
  insertPlainTextAtRange,
  type RichTextCommand,
} from "@/modules/content/rich-text-editor";

type EditorBlock = { editorId: string; value: ContentBlock };
type Localized = Record<EditorLocale, string>;
const LOCALES: EditorLocale[] = ["fa", "tr", "en"];

export function PageBlocksEditor({
  defaultValue,
  initialMediaUrls = {},
}: {
  defaultValue: unknown;
  initialMediaUrls?: PreviewMediaUrls;
}) {
  const t = useTranslations("contentAdmin.blockEditor");
  const initialBlocks = Array.isArray(defaultValue)
    ? (defaultValue as ContentBlock[])
    : [];
  const [blocks, setBlocks] = useState<EditorBlock[]>(() =>
    initialBlocks.map((value, index) => ({
      editorId: `saved-${index}`,
      value,
    })),
  );
  const [locale, setLocale] = useState<EditorLocale>("fa");
  const [newType, setNewType] = useState<ContentBlockType>("RichText");
  const [previewWidth, setPreviewWidth] = useState<390 | 1280>(390);
  const [mediaUrls, setMediaUrls] =
    useState<PreviewMediaUrls>(initialMediaUrls);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const nextId = useRef(initialBlocks.length);
  const values = blocks.map((item) => item.value);
  const preview = useMemo(
    () => buildSafePagePreview(values, locale, mediaUrls),
    [values, locale, mediaUrls],
  );

  function addBlock() {
    if (blocks.length >= 50) return;
    const editorId = `new-${nextId.current++}`;
    setBlocks((current) => [
      ...current,
      { editorId, value: createEmptyContentBlock(newType) },
    ]);
  }

  function updateBlock(index: number, value: ContentBlock) {
    setBlocks((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, value } : item,
      ),
    );
  }

  function moveBlock(from: number, to: number) {
    if (to < 0 || to >= blocks.length || from === to) return;
    setBlocks((current) => {
      const result = [...current];
      const [moved] = result.splice(from, 1);
      result.splice(to, 0, moved);
      return result;
    });
  }

  return (
    <section className="grid gap-5" aria-labelledby="page-block-editor-title">
      <input
        type="hidden"
        name="blocks"
        value={serializeContentBlocks(values)}
        data-testid="serialized-page-blocks"
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="page-block-editor-title" className="text-xl font-semibold">
            {t("title")}
          </h2>
          <p className="muted text-sm">{t("help")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm">
            {t("newBlockType")}
            <select
              className="input min-w-44"
              value={newType}
              onChange={(event) =>
                setNewType(event.target.value as ContentBlockType)
              }
            >
              {CONTENT_BLOCK_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`types.${type}`)}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            onClick={() => {
              if (blocks.length >= 50) return;
              addBlock();
            }}
            disabled={blocks.length >= 50}
          >
            {t("addBlock")}
          </Button>
        </div>
      </div>

      <LocaleTabs locale={locale} onChange={setLocale} />
      {blocks.length === 0 && (
        <div className="rounded-token border border-dashed border-black/20 p-8 text-center muted">
          {t("empty")}
        </div>
      )}
      <div className="grid gap-4">
        {blocks.map((block, index) => (
          <article
            key={block.editorId}
            draggable
            onDragStart={() => setDraggedIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (draggedIndex !== null) moveBlock(draggedIndex, index);
              setDraggedIndex(null);
            }}
            onDragEnd={() => setDraggedIndex(null)}
            className="rounded-token border border-black/10 bg-white p-4 shadow-sm"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-black/10 pb-3">
              <h3 className="font-semibold">
                {index + 1}. {t(`types.${block.value.type}`)}
              </h3>
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="min-h-11"
                  aria-label={t("moveUpLabel", { number: index + 1 })}
                  disabled={index === 0}
                  onClick={() => moveBlock(index, index - 1)}
                >
                  {t("moveUp")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="min-h-11"
                  aria-label={t("moveDownLabel", { number: index + 1 })}
                  disabled={index === blocks.length - 1}
                  onClick={() => moveBlock(index, index + 1)}
                >
                  {t("moveDown")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  aria-label={t("removeLabel", { number: index + 1 })}
                  onClick={() =>
                    setBlocks((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  {t("remove")}
                </Button>
              </div>
            </div>
            <BlockFields
              block={block.value}
              editorId={block.editorId}
              locale={locale}
              mediaUrls={mediaUrls}
              onChange={(value) => updateBlock(index, value)}
              onMedia={(mediaId, url) =>
                setMediaUrls((current) => ({ ...current, [mediaId]: url }))
              }
            />
          </article>
        ))}
      </div>

      <section className="grid gap-3" aria-labelledby="unsaved-preview-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="unsaved-preview-title" className="text-xl font-semibold">
              {t("previewTitle")}
            </h2>
            <p className="muted text-sm">{t("previewHelp")}</p>
          </div>
          <div
            className="flex gap-2"
            role="group"
            aria-label={t("previewSize")}
          >
            {([390, 1280] as const).map((width) => (
              <Button
                key={width}
                type="button"
                variant={previewWidth === width ? "primary" : "secondary"}
                size="sm"
                className="min-h-11"
                aria-pressed={previewWidth === width}
                onClick={() => setPreviewWidth(width)}
              >
                {width === 390 ? t("mobile") : t("desktop")}
              </Button>
            ))}
          </div>
        </div>
        <div className="max-w-full overflow-x-auto rounded-token border border-black/10 bg-black/5 p-3">
          <iframe
            title={t("previewFrameTitle")}
            srcDoc={preview}
            sandbox=""
            referrerPolicy="no-referrer"
            className="mx-auto block min-h-[620px] max-w-full border-0 bg-white shadow-md transition-[width]"
            style={{ width: previewWidth }}
            data-testid="unsaved-page-preview"
          />
        </div>
      </section>
    </section>
  );
}

function LocaleTabs({
  locale,
  onChange,
}: {
  locale: EditorLocale;
  onChange: (locale: EditorLocale) => void;
}) {
  const t = useTranslations("contentAdmin.blockEditor");
  return (
    <div
      className="flex flex-wrap gap-2"
      role="tablist"
      aria-label={t("language")}
    >
      {LOCALES.map((item) => (
        <Button
          key={item}
          type="button"
          role="tab"
          size="sm"
          className="min-h-11"
          variant={locale === item ? "primary" : "secondary"}
          aria-selected={locale === item}
          onClick={() => onChange(item)}
        >
          {t(`locales.${item}`)}
        </Button>
      ))}
    </div>
  );
}

function BlockFields({
  block,
  editorId,
  locale,
  mediaUrls,
  onChange,
  onMedia,
}: {
  block: ContentBlock;
  editorId: string;
  locale: EditorLocale;
  mediaUrls: PreviewMediaUrls;
  onChange: (block: ContentBlock) => void;
  onMedia: (mediaId: string, url: string) => void;
}) {
  const t = useTranslations("contentAdmin.blockEditor");
  const localized = (
    label: string,
    value: Localized,
    update: (value: Localized) => void,
    multiline = false,
  ) => (
    <label className="grid gap-1">
      {label} — {t(`locales.${locale}`)}
      {multiline ? (
        <textarea
          className="input min-h-24"
          dir={locale === "fa" ? "rtl" : "ltr"}
          value={value[locale]}
          onChange={(event) =>
            update({ ...value, [locale]: event.target.value })
          }
        />
      ) : (
        <Input
          dir={locale === "fa" ? "rtl" : "ltr"}
          value={value[locale]}
          onChange={(event) =>
            update({ ...value, [locale]: event.target.value })
          }
        />
      )}
    </label>
  );

  if (block.type === "RichText")
    return (
      <RichTextField
        key={`${editorId}-${locale}-rich`}
        label={t("richText")}
        locale={locale}
        value={block.html[locale]}
        onChange={(html) =>
          onChange({ ...block, html: { ...block.html, [locale]: html } })
        }
      />
    );

  if (block.type === "Image")
    return (
      <div className="grid gap-3">
        <MediaPicker
          name={`editorMedia-${editorId}`}
          label={t("image")}
          defaultMediaId={block.mediaId}
          defaultUrl={mediaUrls[block.mediaId]}
          onSelect={(mediaId, url) => {
            onMedia(mediaId, url);
            onChange({ ...block, mediaId });
          }}
        />
        {localized(t("caption"), block.caption, (caption) =>
          onChange({ ...block, caption }),
        )}
      </div>
    );

  if (block.type === "Hero")
    return (
      <div className="grid gap-3">
        <MediaPicker
          name={`editorMedia-${editorId}`}
          label={t("optionalImage")}
          defaultMediaId={block.mediaId}
          defaultUrl={block.mediaId ? mediaUrls[block.mediaId] : undefined}
          onSelect={(mediaId, url) => {
            onMedia(mediaId, url);
            onChange({ ...block, mediaId });
          }}
        />
        {localized(t("fieldTitle"), block.title, (title) =>
          onChange({ ...block, title }),
        )}
        {localized(
          t("body"),
          block.body,
          (body) => onChange({ ...block, body }),
          true,
        )}
        {localized(t("buttonLabel"), block.ctaLabel, (ctaLabel) =>
          onChange({ ...block, ctaLabel }),
        )}
        <UrlField
          value={block.ctaUrl ?? ""}
          onChange={(ctaUrl) =>
            onChange({ ...block, ctaUrl: ctaUrl || undefined })
          }
        />
      </div>
    );

  if (block.type === "TwoColumns")
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <RichTextField
          key={`${editorId}-${locale}-left`}
          label={t("leftColumn")}
          locale={locale}
          value={block.left[locale]}
          onChange={(html) =>
            onChange({ ...block, left: { ...block.left, [locale]: html } })
          }
        />
        <RichTextField
          key={`${editorId}-${locale}-right`}
          label={t("rightColumn")}
          locale={locale}
          value={block.right[locale]}
          onChange={(html) =>
            onChange({ ...block, right: { ...block.right, [locale]: html } })
          }
        />
      </div>
    );

  if (block.type === "FAQ")
    return (
      <div className="grid gap-3">
        {block.items.map((item, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-token bg-black/[.03] p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <strong>{t("faqItem", { number: index + 1 })}</strong>
              <Button
                type="button"
                size="sm"
                className="min-h-11"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...block,
                    items: block.items.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  })
                }
              >
                {t("remove")}
              </Button>
            </div>
            {localized(t("question"), item.question, (question) =>
              onChange({
                ...block,
                items: block.items.map((candidate, itemIndex) =>
                  itemIndex === index ? { ...candidate, question } : candidate,
                ),
              }),
            )}
            <RichTextField
              key={`${editorId}-${locale}-faq-${index}`}
              label={t("answer")}
              locale={locale}
              value={item.answer[locale]}
              onChange={(answer) =>
                onChange({
                  ...block,
                  items: block.items.map((candidate, itemIndex) =>
                    itemIndex === index
                      ? {
                          ...candidate,
                          answer: { ...candidate.answer, [locale]: answer },
                        }
                      : candidate,
                  ),
                })
              }
            />
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11"
          disabled={block.items.length >= 30}
          onClick={() =>
            onChange({
              ...block,
              items: [
                ...block.items,
                {
                  question: { fa: "", tr: "", en: "" },
                  answer: { fa: "", tr: "", en: "" },
                },
              ],
            })
          }
        >
          {t("addFaq")}
        </Button>
      </div>
    );

  if (block.type === "CTA")
    return (
      <div className="grid gap-3">
        {localized(t("fieldTitle"), block.title, (title) =>
          onChange({ ...block, title }),
        )}
        {localized(t("buttonLabel"), block.label, (label) =>
          onChange({ ...block, label }),
        )}
        <UrlField
          value={block.url}
          onChange={(url) => onChange({ ...block, url })}
        />
      </div>
    );

  if (block.type === "Countdown")
    return (
      <div className="grid gap-3">
        {localized(t("fieldTitle"), block.title, (title) =>
          onChange({ ...block, title }),
        )}
        <label className="grid gap-1">
          {t("endsAt")}
          <Input
            type="datetime-local"
            dir="ltr"
            value={toLocalDateTime(block.endsAt)}
            onChange={(event) => {
              const date = new Date(event.target.value);
              if (!Number.isNaN(date.valueOf()))
                onChange({ ...block, endsAt: date.toISOString() });
            }}
          />
        </label>
      </div>
    );

  return (
    <div className="grid gap-3">
      {localized(t("fieldTitle"), block.title, (title) =>
        onChange({ ...block, title }),
      )}
      <UrlField
        value={block.url}
        onChange={(url) => onChange({ ...block, url })}
        embed
      />
      <p className="muted text-sm">{t("embedHelp")}</p>
    </div>
  );
}

function UrlField({
  value,
  onChange,
  embed = false,
}: {
  value: string;
  onChange: (value: string) => void;
  embed?: boolean;
}) {
  const t = useTranslations("contentAdmin.blockEditor");
  return (
    <label className="grid gap-1">
      {embed ? t("embedUrl") : t("url")}
      <Input
        dir="ltr"
        type="text"
        inputMode="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function RichTextField({
  label,
  locale,
  value,
  onChange,
}: {
  label: string;
  locale: EditorLocale;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("contentAdmin.blockEditor");
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const [link, setLink] = useState("");

  function rememberSelection() {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (
      editor &&
      selection?.rangeCount &&
      editor.contains(selection.anchorNode) &&
      editor.contains(selection.focusNode)
    )
      selectionRef.current = selection.getRangeAt(0).cloneRange();
  }

  function command(name: RichTextCommand, argument?: string) {
    const editor = editorRef.current;
    const saved = selectionRef.current;
    if (!editor || !saved) return;
    const next = applyRichTextCommand(editor, saved, name, argument);
    if (!next) return;
    editor.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(next);
    selectionRef.current = next.cloneRange();
    onChange(editor.innerHTML);
  }
  return (
    <div className="grid gap-1">
      <span>
        {label} — {t(`locales.${locale}`)}
      </span>
      <div
        className="flex flex-wrap items-center gap-1 rounded-t-[10px] border border-b-0 border-black/15 bg-black/[.03] p-2"
        role="toolbar"
        aria-label={t("formatting")}
      >
        <select
          className="min-h-11 rounded-[7px] border border-black/15 bg-white px-2"
          aria-label={t("paragraphStyle")}
          defaultValue="p"
          onChange={(event) =>
            command(
              event.target.value === "h2"
                ? "heading2"
                : event.target.value === "h3"
                  ? "heading3"
                  : "paragraph",
            )
          }
        >
          <option value="p">{t("paragraph")}</option>
          <option value="h2">{t("heading2")}</option>
          <option value="h3">{t("heading3")}</option>
        </select>
        {(["bold", "italic", "bulletList", "orderedList"] as const).map(
          (name) => (
            <button
              key={name}
              type="button"
              className="min-h-11 min-w-11 rounded-[7px] border border-black/15 bg-white px-2"
              aria-label={t(`commands.${name}`)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => command(name)}
            >
              {t(`commandMarks.${name}`)}
            </button>
          ),
        )}
        <input
          className="min-h-11 min-w-40 flex-1 rounded-[7px] border border-black/15 bg-white px-2"
          aria-label={t("linkUrl")}
          dir="ltr"
          placeholder="https://…"
          value={link}
          onChange={(event) => setLink(event.target.value)}
        />
        <button
          type="button"
          className="min-h-11 rounded-[7px] border border-black/15 bg-white px-3"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            command("link", link);
            setLink("");
          }}
        >
          {t("applyLink")}
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={`${label} — ${t(`locales.${locale}`)}`}
        dir={locale === "fa" ? "rtl" : "ltr"}
        className="min-h-36 rounded-b-[10px] border border-black/15 bg-white p-3 leading-7 focus:outline-2 focus:outline-primary"
        dangerouslySetInnerHTML={{ __html: value }}
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        onMouseUp={rememberSelection}
        onKeyUp={rememberSelection}
        onPaste={(event) => {
          event.preventDefault();
          rememberSelection();
          const editor = editorRef.current;
          const saved = selectionRef.current;
          if (!editor || !saved) return;
          const next = insertPlainTextAtRange(
            editor,
            saved,
            event.clipboardData.getData("text/plain"),
          );
          if (next) {
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(next);
            selectionRef.current = next.cloneRange();
          }
          onChange(editor.innerHTML);
        }}
      />
    </div>
  );
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
