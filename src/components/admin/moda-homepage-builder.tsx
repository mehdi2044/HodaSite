"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import type { HomepageBlock } from "@/modules/content/homepage";
import { isModa4Block, MODA4_TYPES } from "@/modules/content/moda4-contracts";
import {
  BlockFields,
  fresh,
  type Labels,
  type SourceOption,
  type LookProductOption,
} from "./homepage-builder";
import {
  ModaSceneField,
  Moda4BlockFields,
  freshModaBlock,
  emptyModaScene,
  type ModaAdminOptions,
} from "./moda4-block-fields";
import { FullHomepagePreview } from "./full-homepage-preview";
import { useUnsavedForm } from "./unsaved-form";
import {
  MediaPickerPendingContext,
  useMediaPickerPending,
} from "./media-picker-pending";
import type { ScenePreviewProof } from "./scene-preview-proof";
import type { HomepageSaveResult } from "@/app/admin/(dashboard)/content/homepage/actions";
function cloneBlock(block: HomepageBlock): HomepageBlock {
  const clone = structuredClone(block);
  function scenes(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(scenes);
    if (!value || typeof value !== "object") return value;
    const row = value as Record<string, unknown>;
    if (
      row.version === 1 &&
      (row.mode === "PHOTO" || row.mode === "COMPOSITE") &&
      Array.isArray(row.pieces)
    )
      return {
        ...row,
        id: crypto.randomUUID(),
        match: undefined,
        pieces: row.pieces.map((piece) => ({
          ...piece,
          id: crypto.randomUUID(),
        })),
      };
    return Object.fromEntries(
      Object.entries(row).map(([key, item]) => [key, scenes(item)]),
    );
  }
  const result = scenes(clone) as HomepageBlock;
  result.id = crypto.randomUUID();
  result.version = 1;
  if (result.type === "HeroSlider")
    result.slides = result.slides.map((slide) => ({
      ...slide,
      id: crypto.randomUUID(),
    }));
  if (result.type === "WorldsPrism")
    result.faces = result.faces.map((face) => ({
      ...face,
      id: crypto.randomUUID(),
    }));
  if (result.type === "ShopLook")
    result.looks = result.looks.map((look) => ({
      ...look,
      id: crypto.randomUUID(),
    }));
  if (result.type === "FittingAd")
    result.looks = result.looks.map((look) => ({
      ...look,
      id: crypto.randomUUID(),
    }));
  return result;
}
export function ModaHomepageBuilder(props: {
  action: (
    previous: ActionResult | null,
    form: FormData,
  ) => Promise<HomepageSaveResult>;
  categories: SourceOption[];
  collections: SourceOption[];
  products: LookProductOption[];
  compositions: Record<string, HomepageBlock[]>;
  fallbackBlocks: HomepageBlock[];
  mediaUrls: Record<string, string>;
  markets: { id: string; code: string; enabledLocales: string[] }[];
  labels: Labels;
  versions: Record<string, number>;
  globalAllowed: boolean;
  writable: Record<string, boolean>;
  options: ModaAdminOptions;
  initialScope?: string;
  historical?: boolean;
}) {
  const a = useTranslations("modaAdmin"),
    nav = useTranslations("adminShell"),
    router = useRouter();
  const [scope, setScope] = useState(
    props.initialScope ??
      (props.globalAllowed ? "global" : (props.markets[0]?.id ?? "")),
  );
  const initial = props.compositions[scope] ?? props.fallbackBlocks;
  const [blocks, setBlocks] = useState(initial),
    [baseline, setBaseline] = useState(JSON.stringify(initial)),
    [version, setVersion] = useState(props.versions[scope] ?? 0),
    [urls, setUrls] = useState(props.mediaUrls);
  const [newType, setNewType] = useState<HomepageBlock["type"]>("HeroSlider"),
    [removed, setRemoved] = useState<HomepageBlock[]>([]),
    [width, setWidth] = useState(390),
    [locale, setLocale] = useState<"fa" | "tr" | "en">("fa");
  const [previewMarketId, setPreviewMarket] = useState(
    props.markets[0]?.id ?? "",
  );
  const [proofs, setProofs] = useState<Record<string, ScenePreviewProof>>({}),
    [approvals, approve] = useState<Record<string, string | undefined>>({});
  const [savedVersion, setSavedVersion] = useState<number | null>(null),
    currentScope = useRef(scope);
  currentScope.current = scope;
  const { uploadsPending, reportPending } = useMediaPickerPending();
  const [result, action, pending] = useActionState(
    async (previous: ActionResult | null, form: FormData) => {
      const submittedScope = String(form.get("marketId") || "global");
      const result = await props.action(previous, form);
      if (result.draftSaved && submittedScope === currentScope.current)
        setSavedVersion(result.savedVersion ?? null);
      return result;
    },
    null,
  );
  const dirty =
    JSON.stringify(blocks) !== baseline ||
    Object.values(approvals).some(Boolean);
  const form = useUnsavedForm(
    result,
    nav("unsavedChanges"),
    dirty || uploadsPending,
  );
  const allowed = props.writable[scope] && !props.historical;
  useEffect(() => {
    if (savedVersion === null || props.versions[scope] !== savedVersion) return;
    const saved = props.compositions[scope] ?? props.fallbackBlocks;
    setBlocks(saved);
    setBaseline(JSON.stringify(saved));
    setVersion(savedVersion);
    approve({});
    setRemoved([]);
    setSavedVersion(null);
    router.refresh();
  }, [
    savedVersion,
    props.versions,
    props.compositions,
    props.fallbackBlocks,
    scope,
    router,
  ]);
  const update = (index: number, block: HomepageBlock) =>
    setBlocks((all) => all.map((item, n) => (n === index ? block : item)));
  const move = (index: number, direction: number) =>
    setBlocks((all) => {
      const target = index + direction;
      if (target < 0 || target >= all.length) return all;
      const copy = [...all];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  const market =
    props.markets.find(
      (item) => item.id === (scope === "global" ? previewMarketId : scope),
    ) ?? props.markets[0];
  const actualLocale = market?.enabledLocales.includes(locale)
    ? locale
    : ((market?.enabledLocales[0] as typeof locale) ?? "en");
  const options = {
    ...props.options,
    products: props.options.products.filter(
      (product) => scope === "global" || product.marketIds.includes(scope),
    ),
    programs: props.options.programs.filter(
      (program) => scope === "global" || program.marketId === scope,
    ),
  };
  const activeSceneIds = new Set<string>();
  const collect = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    if (
      row.version === 1 &&
      (row.mode === "PHOTO" || row.mode === "COMPOSITE") &&
      typeof row.id === "string"
    ) {
      activeSceneIds.add(row.id);
      return;
    }
    Object.values(row).forEach(collect);
  };
  blocks.filter((block) => block.enabled !== false).forEach(collect);
  const confirmed = Object.entries(approvals).flatMap(
    ([sceneId, fingerprint]) =>
      fingerprint &&
      activeSceneIds.has(sceneId) &&
      proofs[sceneId]?.fingerprint === fingerprint
        ? [{ sceneId, fingerprint }]
        : [],
  );
  const switchScope = (scope: string) => {
    if ((dirty || uploadsPending) && !window.confirm(nav("unsavedChanges")))
      return;
    if (props.historical) {
      router.push(`/admin/content/homepage?${new URLSearchParams({ scope })}`);
      return;
    }
    const blocks = props.compositions[scope] ?? props.fallbackBlocks;
    setScope(scope);
    setBlocks(structuredClone(blocks));
    setBaseline(JSON.stringify(blocks));
    setVersion(props.versions[scope] ?? 0);
    setProofs({});
    approve({});
    setRemoved([]);
    setSavedVersion(null);
  };
  const onMedia = (id: string, url: string) =>
    setUrls((current) => ({ ...current, [id]: url }));
  return (
    <MediaPickerPendingContext.Provider value={reportPending}>
      <div className="grid gap-5 min-w-0">
        <header>
          <h1 className="text-2xl font-semibold">{props.labels.title}</h1>
          <p>{a("help")}</p>
          <a
            className="button button-outline"
            href={`/admin/content/homepage/scenes?${new URLSearchParams({ scope })}`}
          >
            {a("publicationHistory")}
          </a>
          {props.historical && <p role="status">{a("historicalReadonly")}</p>}
        </header>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <form
            ref={form}
            action={action}
            data-testid="homepage-form"
            className="grid gap-4 min-w-0"
            onSubmit={(event) => {
              if (uploadsPending || !allowed) event.preventDefault();
            }}
          >
            <label>
              {props.labels.market}
              <select
                className="input"
                value={scope}
                disabled={pending}
                onChange={(event) => switchScope(event.target.value)}
              >
                {props.globalAllowed && (
                  <option value="global">{props.labels.global}</option>
                )}
                {props.markets.map((market) => (
                  <option key={market.id} value={market.id}>
                    {market.code}
                  </option>
                ))}
              </select>
            </label>
            <input
              type="hidden"
              name="marketId"
              value={scope === "global" ? "" : scope}
            />
            <input type="hidden" name="expectedVersion" value={version} />
            <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
            <input
              type="hidden"
              name="expectedSceneFingerprints"
              value={JSON.stringify(confirmed)}
            />
            {confirmed.map((proof) => (
              <input
                key={proof.sceneId}
                type="hidden"
                name="confirmSceneIds"
                value={proof.sceneId}
              />
            ))}
            {props.versions[scope] !== undefined &&
              props.versions[scope] !== version && (
                <p role="status">
                  {a("staleDraft")}
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => {
                      if (!dirty || window.confirm(nav("unsavedChanges")))
                        switchScope(scope);
                    }}
                  >
                    {a("reloadDraft")}
                  </button>
                </p>
              )}
            <fieldset disabled={pending || !allowed} className="contents">
              {blocks.map((block, index) => (
                <details
                  key={block.id ?? `${block.type}-${index}`}
                  open
                  className="card grid gap-3 min-w-0"
                >
                  <summary>
                    {index + 1}.{" "}
                    {isModa4Block(block)
                      ? a(`block_${block.type}`)
                      : block.type}
                  </summary>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="button button-outline"
                      aria-label={`${props.labels.moveUp} ${index + 1}`}
                      onClick={() => move(index, -1)}
                    >
                      {props.labels.moveUp}
                    </button>
                    <button
                      type="button"
                      className="button button-outline"
                      aria-label={`${props.labels.moveDown} ${index + 1}`}
                      onClick={() => move(index, 1)}
                    >
                      {props.labels.moveDown}
                    </button>
                    <button
                      type="button"
                      className="button button-outline"
                      onClick={() =>
                        setBlocks((all) => [
                          ...all.slice(0, index + 1),
                          cloneBlock(block),
                          ...all.slice(index + 1),
                        ])
                      }
                      disabled={blocks.length >= 30}
                    >
                      {a("clone")}
                    </button>
                    <label>
                      <input
                        type="checkbox"
                        checked={block.enabled !== false}
                        onChange={(event) =>
                          update(index, {
                            ...block,
                            enabled: event.target.checked,
                          })
                        }
                      />
                      {a("enabled")}
                    </label>
                    <button
                      type="button"
                      className="button button-outline"
                      onClick={() => {
                        setRemoved((all) => [...all, block]);
                        setBlocks((all) => all.filter((_, n) => n !== index));
                      }}
                    >
                      {props.labels.remove}
                    </button>
                  </div>
                  {isModa4Block(block) ? (
                    <Moda4BlockFields
                      block={block}
                      change={(block) => update(index, block)}
                      options={options}
                      urls={urls}
                      onMedia={onMedia}
                      proofs={proofs}
                      approvals={approvals}
                      approve={(sceneId, fingerprint) =>
                        approve((old) => ({ ...old, [sceneId]: fingerprint }))
                      }
                      scope={scope}
                    />
                  ) : (
                    <div className="grid gap-3">
                      {(block.type === "ShopLook" ||
                        block.type === "Hero" ||
                        block.type === "Banner") && (
                        <label>
                          <input
                            type="checkbox"
                            checked={Boolean(block.scene)}
                            onChange={(event) =>
                              update(index, {
                                ...block,
                                scene: event.target.checked
                                  ? emptyModaScene()
                                  : undefined,
                              })
                            }
                          />
                          {a("sharedScene")}
                        </label>
                      )}
                      {(block.type === "ShopLook" ||
                        block.type === "Hero" ||
                        block.type === "Banner") &&
                        block.scene && (
                          <ModaSceneField
                            scene={block.scene}
                            change={(scene) =>
                              update(index, {
                                ...block,
                                scene,
                                title: scene.title,
                              })
                            }
                            options={options}
                            urls={urls}
                            onMedia={onMedia}
                            proof={proofs[block.scene.id]}
                            approved={approvals[block.scene.id]}
                            approve={(sceneId, fingerprint) =>
                              approve((old) => ({
                                ...old,
                                [sceneId]: fingerprint,
                              }))
                            }
                          />
                        )}
                      <BlockFields
                        block={block}
                        products={props.products.filter((product) =>
                          options.products.some(
                            (item) => item.id === product.id,
                          ),
                        )}
                        categories={props.categories}
                        collections={props.collections}
                        index={index}
                        labels={props.labels}
                        urls={urls}
                        update={update}
                        setUrls={setUrls}
                      />
                    </div>
                  )}
                </details>
              ))}
              <label>
                {props.labels.add}
                <select
                  className="input"
                  value={newType}
                  onChange={(event) =>
                    setNewType(event.target.value as typeof newType)
                  }
                >
                  {[
                    ...MODA4_TYPES,
                    "ShopLook",
                    "Hero",
                    "CategoryCards",
                    "ProductStrip",
                    "Banner",
                    "TrustBar",
                    "RichText",
                  ].map((type) => (
                    <option key={type} value={type}>
                      {(MODA4_TYPES as readonly string[]).includes(type)
                        ? a(`block_${type}`)
                        : type}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="button button-outline"
                disabled={blocks.length >= 30}
                onClick={() =>
                  setBlocks((all) => [
                    ...all,
                    (MODA4_TYPES as readonly string[]).includes(newType)
                      ? freshModaBlock(newType as (typeof MODA4_TYPES)[number])
                      : {
                          ...fresh(newType),
                          ...(newType === "ShopLook"
                            ? { scene: emptyModaScene() }
                            : {}),
                          id: crypto.randomUUID(),
                          version: 1,
                          enabled: true,
                        },
                  ])
                }
              >
                {props.labels.add}
              </button>
              {removed.length > 0 && (
                <button
                  type="button"
                  className="button button-outline"
                  disabled={blocks.length >= 30}
                  onClick={() => {
                    setBlocks((all) => [...all, removed[removed.length - 1]]);
                    setRemoved((all) => all.slice(0, -1));
                  }}
                >
                  {a("restoreRemoved")}
                </button>
              )}
            </fieldset>
            {result && !result.ok && <p role="alert">{result.message}</p>}
            {result?.ok && <p role="status">{a("saved")}</p>}
            <button
              type="submit"
              name="intent"
              value="DRAFT"
              className="button"
              disabled={pending || uploadsPending || !allowed}
            >
              {props.labels.save}
            </button>
            <button
              type="submit"
              name="intent"
              value="PUBLISH"
              className="button button-outline"
              disabled={pending || uploadsPending || !allowed}
            >
              {props.labels.publish}
            </button>
          </form>
          <section className="min-w-0 grid content-start gap-3">
            <h2>{props.labels.preview}</h2>
            <div className="flex flex-wrap gap-2">
              {scope === "global" && (
                <label>
                  {a("previewMarket")}
                  <select
                    className="input"
                    value={market?.id}
                    onChange={(event) => {
                      setPreviewMarket(event.target.value);
                      setProofs({});
                      approve({});
                    }}
                  >
                    {props.markets.map((market) => (
                      <option key={market.id} value={market.id}>
                        {market.code}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                {a("previewLanguage")}
                <select
                  className="input"
                  value={actualLocale}
                  onChange={(event) =>
                    setLocale(event.target.value as typeof locale)
                  }
                >
                  {market?.enabledLocales.map((locale) => (
                    <option key={locale} value={locale}>
                      {locale}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setWidth(390)}
              >
                {props.labels.mobile}
              </button>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setWidth(1440)}
              >
                {props.labels.desktop}
              </button>
            </div>
            <FullHomepagePreview
              key={scope}
              scopeMarketId={scope === "global" ? null : scope}
              market={market}
              locale={actualLocale}
              blocks={blocks}
              width={width}
              onProofs={(visibleIds, incoming) =>
                setProofs((old) => {
                  const updated = { ...old };
                  for (const id of visibleIds) delete updated[id];
                  for (const proof of incoming) updated[proof.sceneId] = proof;
                  return updated;
                })
              }
            />
          </section>
        </div>
      </div>
    </MediaPickerPendingContext.Provider>
  );
}
