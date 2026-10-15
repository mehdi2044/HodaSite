"use client";
import { useTranslations } from "next-intl";
import { SceneAnchorCanvas } from "./scene-editor";
import { MediaPicker } from "./media-picker";
import type { Moda4Block } from "@/modules/content/moda4-contracts";
import type { ShoppableScene } from "@/modules/content/scenes/contracts";
import { sceneConfirmationKey } from "@/modules/content/scenes/contracts";
import { SCENE_ASPECTS } from "@/modules/content/scenes/geometry";
import type { ContentTarget } from "@/modules/content/moda4-targets";
import type { ScenePreviewProof } from "./scene-preview-proof";
type Localized = { fa: string; tr: string; en: string };
export type ModaAdminOptions = {
  categories: { id: string; title: string }[];
  collections: { id: string; title: string }[];
  pages: { id: string; title: string }[];
  programs: { id: string; marketId: string; title: string; state: string }[];
  products: {
    id: string;
    title: string;
    marketIds: string[];
    colors: {
      id: string;
      title: string;
      images: { id: string; url: string; title: string }[];
      cutouts: {
        id: string;
        url: string;
        title: string;
        variantId: string | null;
      }[];
      variants: { id: string; size: string }[];
    }[];
  }[];
  models: {
    id: string;
    title: string;
    kind: string;
    mediaId: string;
    url: string;
  }[];
};
const blank = (): Localized => ({ fa: "", tr: "", en: "" });
const identity = () => crypto.randomUUID();
export function emptyModaScene(): ShoppableScene {
  return {
    id: identity(),
    version: 1,
    mode: "PHOTO",
    title: blank(),
    alt: blank(),
    desktop: {
      mediaId: "",
      fit: "contain",
      aspect: "3:2",
      focal: { x: 0.5, y: 0.5 },
    },
    mobile: {
      mediaId: "",
      fit: "contain",
      aspect: "4:5",
      focal: { x: 0.5, y: 0.5 },
    },
    pieces: [],
  };
}
const image = () => emptyModaScene().desktop;
const target = () => ({ kind: "catalog" as const });
const source = () => ({
  mode: "latest" as const,
  limit: 6,
  productIds: [] as string[],
});
export function freshModaBlock(type: Moda4Block["type"]): Moda4Block {
  const base = { id: identity(), version: 1 as const, enabled: true },
    title = blank(),
    body = blank(),
    ctaLabel = blank();
  switch (type) {
    case "HeroSlider":
      return {
        ...base,
        type,
        slides: [
          {
            id: identity(),
            eyebrow: blank(),
            scene: emptyModaScene(),
            body,
            textSide: "start",
            ctaLabel,
            target: target(),
          },
        ],
        autoplaySeconds: 7,
      };
    case "Bands":
      return {
        ...base,
        type,
        first: [blank()],
        second: [blank()],
        durationSeconds: 30,
      };
    case "WorldsPrism":
      return {
        ...base,
        type,
        title,
        faces: Array.from({ length: 4 }, () => ({
          id: identity(),
          categoryId: "",
          title: blank(),
          subtitle: blank(),
          desktop: image(),
          mobile: { ...image(), aspect: "4:5" as const },
        })),
        autoplaySeconds: 3.8,
      };
    case "NewIn":
      return {
        ...base,
        type,
        title,
        source: source(),
        ctaLabel,
        target: target(),
      };
    case "FittingAd":
      return {
        ...base,
        type,
        title,
        body,
        looks: [{ id: identity(), label: blank(), scene: emptyModaScene() }],
        ctaLabel,
        target: { kind: "fitting" },
      };
    case "Lookbook":
      return {
        ...base,
        type,
        title,
        scenes: [emptyModaScene()],
        autoplaySeconds: 4.8,
      };
    case "KidsWorld":
      return {
        ...base,
        type,
        title,
        body,
        source: source(),
        tone: "kidsMint",
        ctaLabel,
        target: target(),
      };
    case "Services":
      return {
        ...base,
        type,
        title,
        keys: ["shipping", "returns", "prices", "support"],
      };
    case "Campaign":
      return {
        ...base,
        type,
        title,
        body,
        programId: "",
        desktop: image(),
        mobile: { ...image(), aspect: "4:5" },
        ctaLabel,
        target: target(),
        countdown: false,
        popup: { enabled: false, delaySeconds: 10, frequencyHours: 24 },
      };
    case "VideoBanner":
      return {
        ...base,
        type,
        title,
        body,
        videoMediaId: "",
        desktop: image(),
        mobile: { ...image(), aspect: "4:5" },
        ctaLabel,
        target: target(),
        mutedAutoplay: false,
      };
  }
}
export function LocalizedField({
  label,
  value,
  change,
  multiline = false,
}: {
  label: string;
  value: Localized;
  change: (value: Localized) => void;
  multiline?: boolean;
}) {
  return (
    <fieldset className="moda-localized-fields">
      <legend>{label}</legend>
      {(["fa", "tr", "en"] as const).map((locale) => (
        <label key={locale}>
          {locale === "fa" ? "فارسی" : locale === "tr" ? "Türkçe" : "English"}
          {multiline ? (
            <textarea
              className="input"
              dir={locale === "fa" ? "rtl" : "ltr"}
              value={value[locale]}
              onChange={(event) =>
                change({ ...value, [locale]: event.target.value })
              }
            />
          ) : (
            <input
              className="input"
              dir={locale === "fa" ? "rtl" : "ltr"}
              value={value[locale]}
              onChange={(event) =>
                change({ ...value, [locale]: event.target.value })
              }
            />
          )}
        </label>
      ))}
    </fieldset>
  );
}
export function ModaTargetField({
  value,
  change,
  options,
}: {
  value: ContentTarget;
  change: (value: ContentTarget) => void;
  options: ModaAdminOptions;
}) {
  const t = useTranslations("modaAdmin"),
    choices =
      value.kind === "category"
        ? options.categories
        : value.kind === "collection"
          ? options.collections
          : value.kind === "product"
            ? options.products
            : value.kind === "page"
              ? options.pages
              : null;
  return (
    <fieldset className="grid gap-2">
      <legend>{t("target")}</legend>
      <select
        aria-label={t("targetType")}
        className="input"
        value={value.kind}
        onChange={(event) =>
          change({ kind: event.target.value as typeof value.kind })
        }
      >
        {(
          [
            "category",
            "collection",
            "product",
            "page",
            "catalog",
            "search",
            "fitting",
          ] as const
        ).map((kind) => (
          <option key={kind} value={kind}>
            {t(`target_${kind}`)}
          </option>
        ))}
      </select>
      {choices && (
        <select
          aria-label={t("targetIdentity")}
          className="input"
          value={value.id ?? ""}
          onChange={(event) => change({ ...value, id: event.target.value })}
        >
          <option value="">{t("choose")}</option>
          {choices.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      )}
    </fieldset>
  );
}
export function ModaImageField({
  value,
  change,
  label,
  urls,
  onMedia,
  selectMedia = true,
}: {
  selectMedia?: boolean;
  value: ShoppableScene["desktop"];
  change: (value: ShoppableScene["desktop"]) => void;
  label: string;
  urls: Record<string, string>;
  onMedia: (id: string, url: string) => void;
}) {
  const t = useTranslations("scenes");
  return (
    <fieldset className="grid gap-2">
      <legend>{label}</legend>
      {selectMedia && (
        <MediaPicker
          key={value.mediaId}
          name={`modaMedia-${label}`}
          label={label}
          defaultMediaId={value.mediaId}
          defaultUrl={urls[value.mediaId]}
          onSelect={(id, url) => {
            onMedia(id, url);
            change({ ...value, mediaId: id });
          }}
        />
      )}
      <label>
        {t("fit")}
        <select
          className="input"
          value={value.fit}
          onChange={(event) =>
            change({ ...value, fit: event.target.value as typeof value.fit })
          }
        >
          <option value="contain">{t("contain")}</option>
          <option value="cover">{t("cover")}</option>
        </select>
      </label>
      <label>
        {t("aspect")}
        <select
          className="input"
          value={value.aspect}
          onChange={(event) =>
            change({
              ...value,
              aspect: event.target.value as typeof value.aspect,
            })
          }
        >
          {SCENE_ASPECTS.map((aspect) => (
            <option key={aspect}>{aspect}</option>
          ))}
        </select>
      </label>
      {(["x", "y"] as const).map((axis) => (
        <label key={axis}>
          {t(axis === "x" ? "focalX" : "focalY")}
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            className="input"
            value={value.focal[axis]}
            onChange={(event) =>
              change({
                ...value,
                focal: { ...value.focal, [axis]: Number(event.target.value) },
              })
            }
          />
        </label>
      ))}
    </fieldset>
  );
}
export function ModaSceneField({
  scene,
  change,
  options,
  urls,
  onMedia,
  proof,
  approved,
  approve,
}: {
  scene: ShoppableScene;
  change: (scene: ShoppableScene) => void;
  options: ModaAdminOptions;
  urls: Record<string, string>;
  onMedia: (id: string, url: string) => void;
  proof?: ScenePreviewProof;
  approved?: string;
  approve: (sceneId: string, fingerprint: string | undefined) => void;
}) {
  const t = useTranslations("scenes"),
    a = useTranslations("modaAdmin");
  const changePiece = (
    index: number,
    patch: Partial<ShoppableScene["pieces"][number]>,
  ) =>
    change({
      ...scene,
      pieces: scene.pieces.map((piece, n) =>
        n === index ? { ...piece, ...patch } : piece,
      ),
    });
  return (
    <fieldset className="moda-scene-fields grid gap-3">
      <legend>{a("shoppableScene")}</legend>
      <label>
        {t("sceneMode")}
        <select
          className="input"
          value={scene.mode}
          onChange={(event) =>
            change({
              ...scene,
              mode: event.target.value as typeof scene.mode,
              modelId: undefined,
              match: undefined,
              desktop: { ...scene.desktop, mediaId: "" },
              mobile: { ...scene.mobile, mediaId: "" },
              pieces: scene.pieces.map((piece) => ({
                ...piece,
                referenceMediaId: "",
                preferredVariantId: undefined,
              })),
            })
          }
        >
          <option value="PHOTO">{t("photoMode")}</option>
          <option
            value="COMPOSITE"
            disabled={Boolean(scene.relatedVideoMediaId)}
          >
            {t("compositeMode")}
          </option>
        </select>
      </label>
      <LocalizedField
        label={t("title")}
        value={scene.title}
        change={(title) => change({ ...scene, title })}
      />
      <LocalizedField
        label={t("alt")}
        value={scene.alt}
        change={(alt) => change({ ...scene, alt })}
      />
      {scene.mode === "COMPOSITE" ? (
        <>
          <p>{t("compositeHelp")}</p>
          <label>
            {t("storeModel")}
            <select
              className="input"
              value={scene.modelId ?? ""}
              onChange={(event) => {
                const model = options.models.find(
                  (item) => item.id === event.target.value,
                );
                if (!model) return;
                onMedia(model.mediaId, model.url);
                change({
                  ...scene,
                  modelId: model.id,
                  desktop: { ...scene.desktop, mediaId: model.mediaId },
                  mobile: { ...scene.mobile, mediaId: model.mediaId },
                });
              }}
            >
              <option value="">{t("chooseModel")}</option>
              {options.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.title} — {model.kind}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        (["desktop", "mobile"] as const).map((kind) => (
          <ModaImageField
            key={kind}
            value={scene[kind]}
            label={t(kind === "desktop" ? "desktopImage" : "mobileImage")}
            change={(value) => change({ ...scene, [kind]: value })}
            urls={urls}
            onMedia={onMedia}
          />
        ))
      )}
      {scene.mode === "COMPOSITE" &&
        (["desktop", "mobile"] as const).map((kind) => (
          <ModaImageField
            key={kind}
            selectMedia={false}
            value={scene[kind]}
            label={t(kind === "desktop" ? "desktopImage" : "mobileImage")}
            change={(value) => change({ ...scene, [kind]: value })}
            urls={urls}
            onMedia={onMedia}
          />
        ))}
      {(["desktop", "mobile"] as const).map((kind) =>
        urls[scene[kind].mediaId] ? (
          <SceneAnchorCanvas
            key={kind}
            scene={scene}
            kind={kind}
            url={urls[scene[kind].mediaId]}
            change={changePiece}
          />
        ) : null,
      )}
      {scene.pieces.map((piece, index) => {
        const product = options.products.find(
            (item) => item.id === piece.productId,
          ),
          color = product?.colors.find((item) => item.id === piece.colorId),
          images =
            scene.mode === "PHOTO"
              ? color?.images
              : color?.cutouts.filter(
                  (item) =>
                    !item.variantId ||
                    item.variantId === piece.preferredVariantId,
                );
        return (
          <div key={piece.id} className="card grid gap-2">
            <label>
              {t("product")}
              <select
                className="input"
                value={piece.productId}
                onChange={(event) =>
                  changePiece(index, {
                    productId: event.target.value,
                    colorId: "",
                    referenceMediaId: "",
                    preferredVariantId: undefined,
                  })
                }
              >
                <option value="">{t("chooseProduct")}</option>
                {options.products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("color")}
              <select
                className="input"
                value={piece.colorId}
                onChange={(event) =>
                  changePiece(index, {
                    colorId: event.target.value,
                    referenceMediaId: "",
                    preferredVariantId: undefined,
                  })
                }
              >
                <option value="">{t("chooseColor")}</option>
                {product?.colors.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("preferredVariant")}
              <select
                className="input"
                value={piece.preferredVariantId ?? ""}
                onChange={(event) =>
                  changePiece(index, {
                    preferredVariantId: event.target.value || undefined,
                    ...(scene.mode === "COMPOSITE"
                      ? { referenceMediaId: "" }
                      : {}),
                  })
                }
              >
                <option value="">{t("none")}</option>
                {color?.variants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.size}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("referenceImage")}
              <select
                className="input"
                value={piece.referenceMediaId}
                onChange={(event) =>
                  changePiece(index, { referenceMediaId: event.target.value })
                }
              >
                <option value="">{t("chooseReference")}</option>
                {images?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            {(["desktop", "mobile"] as const).map((kind) => (
              <fieldset key={kind}>
                <legend>
                  {t(kind === "desktop" ? "desktopImage" : "mobileImage")} —{" "}
                  {a("pricePin")}
                </legend>
                {(["x", "y"] as const).map((axis) => (
                  <label key={axis}>
                    {axis.toUpperCase()}
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={piece[kind][axis]}
                      onChange={(event) =>
                        changePiece(index, {
                          [kind]: {
                            ...piece[kind],
                            [axis]: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </fieldset>
            ))}
            <LocalizedField
              label={a("pieceLabel")}
              value={piece.label ?? blank()}
              change={(label) => changePiece(index, { label })}
            />
            <button
              type="button"
              className="button button-outline"
              onClick={() =>
                change({
                  ...scene,
                  pieces: scene.pieces.filter((_, n) => n !== index),
                })
              }
            >
              {a("remove")}
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="button button-outline"
        disabled={scene.pieces.length >= (scene.mode === "PHOTO" ? 12 : 4)}
        onClick={() =>
          change({
            ...scene,
            pieces: [
              ...scene.pieces,
              {
                id: identity(),
                productId: "",
                colorId: "",
                referenceMediaId: "",
                desktop: { x: 0.5, y: 0.5 },
                mobile: { x: 0.5, y: 0.5 },
                side: "end",
              },
            ],
          })
        }
      >
        {t("addPiece")}
      </button>
      {scene.mode === "PHOTO" && (
        <label>
          <input
            type="checkbox"
            checked={Boolean(
              proof &&
              proof.key === sceneConfirmationKey(scene) &&
              approved === proof.fingerprint,
            )}
            disabled={!proof || proof.key !== sceneConfirmationKey(scene)}
            onChange={(event) =>
              approve(
                scene.id,
                event.target.checked ? proof?.fingerprint : undefined,
              )
            }
          />{" "}
          {t("confirmMatch")}
        </label>
      )}
    </fieldset>
  );
}
export function Moda4BlockFields({
  block,
  change,
  options,
  urls,
  onMedia,
  proofs,
  approvals,
  approve,
  scope,
}: {
  block: Moda4Block;
  change: (block: Moda4Block) => void;
  options: ModaAdminOptions;
  urls: Record<string, string>;
  onMedia: (id: string, url: string) => void;
  proofs: Record<string, ScenePreviewProof>;
  approvals: Record<string, string | undefined>;
  approve: (sceneId: string, fingerprint: string | undefined) => void;
  scope: string;
}) {
  const t = useTranslations("modaAdmin");
  const sceneField = (
    scene: ShoppableScene,
    update: (scene: ShoppableScene) => void,
  ) => (
    <ModaSceneField
      scene={scene}
      change={update}
      options={options}
      urls={urls}
      onMedia={onMedia}
      proof={proofs[scene.id]}
      approved={approvals[scene.id]}
      approve={approve}
    />
  );
  const picture = (
    value: ShoppableScene["desktop"],
    update: (value: ShoppableScene["desktop"]) => void,
    kind: string,
  ) => (
    <ModaImageField
      value={value}
      change={update}
      label={t(kind)}
      urls={urls}
      onMedia={onMedia}
    />
  );
  const number = (
    label: string,
    value: number,
    update: (value: number) => void,
    min: number,
    max: number,
    step = 1,
  ) => (
    <label>
      {t(label)}
      <input
        className="input"
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => update(Number(event.target.value))}
      />
    </label>
  );
  const sourceField = (
    value: Extract<Moda4Block, { type: "NewIn" }>["source"],
    update: (value: Extract<Moda4Block, { type: "NewIn" }>["source"]) => void,
  ) => (
    <fieldset className="grid gap-2">
      <legend>{t("source")}</legend>
      <select
        className="input"
        aria-label={t("source")}
        value={value.mode}
        onChange={(event) =>
          update({ ...value, mode: event.target.value as typeof value.mode })
        }
      >
        {(
          ["latest", "bestseller", "category", "collection", "manual"] as const
        ).map((mode) => (
          <option key={mode} value={mode}>
            {t(`source_${mode}`)}
          </option>
        ))}
      </select>
      {(value.mode === "category" || value.mode === "collection") && (
        <select
          className="input"
          aria-label={t("sourceIdentity")}
          value={value.referenceId ?? ""}
          onChange={(event) =>
            update({ ...value, referenceId: event.target.value })
          }
        >
          <option value="">{t("choose")}</option>
          {(value.mode === "category"
            ? options.categories
            : options.collections
          ).map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      )}
      {value.mode === "manual" && (
        <div className="moda-manual-products">
          {options.products.map((product) => (
            <label key={product.id}>
              <input
                type="checkbox"
                checked={value.productIds.includes(product.id)}
                onChange={(event) =>
                  update({
                    ...value,
                    productIds: event.target.checked
                      ? [...value.productIds, product.id]
                      : value.productIds.filter((id) => id !== product.id),
                  })
                }
              />{" "}
              {product.title}
            </label>
          ))}
        </div>
      )}
      {number(
        "limit",
        value.limit,
        (limit) => update({ ...value, limit }),
        1,
        24,
      )}
    </fieldset>
  );
  if (block.type === "HeroSlider")
    return (
      <div className="grid gap-4">
        {number(
          "autoplaySeconds",
          block.autoplaySeconds,
          (autoplaySeconds) => change({ ...block, autoplaySeconds }),
          5,
          30,
        )}
        {block.slides.map((slide, index) => (
          <fieldset key={slide.id} className="card grid gap-3">
            <legend>{t("slide", { number: index + 1 })}</legend>
            <LocalizedField
              label={t("eyebrow")}
              value={slide.eyebrow}
              change={(eyebrow) =>
                change({
                  ...block,
                  slides: block.slides.map((item, n) =>
                    n === index ? { ...item, eyebrow } : item,
                  ),
                })
              }
            />
            {sceneField(slide.scene, (scene) =>
              change({
                ...block,
                slides: block.slides.map((item, n) =>
                  n === index ? { ...item, scene } : item,
                ),
              }),
            )}
            <LocalizedField
              label={t("body")}
              value={slide.body}
              multiline
              change={(body) =>
                change({
                  ...block,
                  slides: block.slides.map((item, n) =>
                    n === index ? { ...item, body } : item,
                  ),
                })
              }
            />
            <LocalizedField
              label={t("ctaLabel")}
              value={slide.ctaLabel}
              change={(ctaLabel) =>
                change({
                  ...block,
                  slides: block.slides.map((item, n) =>
                    n === index ? { ...item, ctaLabel } : item,
                  ),
                })
              }
            />
            <ModaTargetField
              value={slide.target}
              options={options}
              change={(target) =>
                change({
                  ...block,
                  slides: block.slides.map((item, n) =>
                    n === index ? { ...item, target } : item,
                  ),
                })
              }
            />
            <label>
              {t("textSide")}
              <select
                className="input"
                value={slide.textSide}
                onChange={(event) =>
                  change({
                    ...block,
                    slides: block.slides.map((item, n) =>
                      n === index
                        ? {
                            ...item,
                            textSide: event.target.value as "start" | "end",
                          }
                        : item,
                    ),
                  })
                }
              >
                <option value="start">{t("start")}</option>
                <option value="end">{t("end")}</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(slide.secondaryTarget)}
                onChange={(event) =>
                  change({
                    ...block,
                    slides: block.slides.map((item, n) =>
                      n === index
                        ? {
                            ...item,
                            secondaryTarget: event.target.checked
                              ? target()
                              : undefined,
                            secondaryLabel: event.target.checked
                              ? blank()
                              : undefined,
                          }
                        : item,
                    ),
                  })
                }
              />{" "}
              {t("secondaryCta")}
            </label>
            {slide.secondaryTarget && (
              <>
                <LocalizedField
                  label={t("secondaryLabel")}
                  value={slide.secondaryLabel ?? blank()}
                  change={(secondaryLabel) =>
                    change({
                      ...block,
                      slides: block.slides.map((item, n) =>
                        n === index ? { ...item, secondaryLabel } : item,
                      ),
                    })
                  }
                />
                <ModaTargetField
                  value={slide.secondaryTarget}
                  options={options}
                  change={(secondaryTarget) =>
                    change({
                      ...block,
                      slides: block.slides.map((item, n) =>
                        n === index ? { ...item, secondaryTarget } : item,
                      ),
                    })
                  }
                />
              </>
            )}
            <button
              type="button"
              className="button button-outline"
              disabled={block.slides.length < 2}
              onClick={() =>
                change({
                  ...block,
                  slides: block.slides.filter((_, n) => n !== index),
                })
              }
            >
              {t("remove")}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="button button-outline"
          disabled={block.slides.length >= 8}
          onClick={() =>
            change({
              ...block,
              slides: [
                ...block.slides,
                {
                  id: identity(),
                  eyebrow: blank(),
                  scene: emptyModaScene(),
                  body: blank(),
                  textSide: "start",
                  ctaLabel: blank(),
                  target: target(),
                },
              ],
            })
          }
        >
          {t("addSlide")}
        </button>
      </div>
    );
  if (block.type === "Bands")
    return (
      <div className="grid gap-3">
        {number(
          "durationSeconds",
          block.durationSeconds,
          (durationSeconds) => change({ ...block, durationSeconds }),
          10,
          120,
        )}
        {(["first", "second"] as const).map((row) => (
          <fieldset key={row}>
            <legend>{t(row)}</legend>
            {block[row].map((word, index) => (
              <div key={index}>
                <LocalizedField
                  label={t("word", { number: index + 1 })}
                  value={word}
                  change={(value) =>
                    change({
                      ...block,
                      [row]: block[row].map((item, n) =>
                        n === index ? value : item,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="button button-outline"
                  disabled={block[row].length < 2}
                  onClick={() =>
                    change({
                      ...block,
                      [row]: block[row].filter((_, n) => n !== index),
                    })
                  }
                >
                  {t("remove")}
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button button-outline"
              disabled={block[row].length >= 12}
              onClick={() =>
                change({ ...block, [row]: [...block[row], blank()] })
              }
            >
              {t("addWord")}
            </button>
          </fieldset>
        ))}
      </div>
    );
  const title = (
    <LocalizedField
      label={t("title")}
      value={block.title}
      change={(title) => change({ ...block, title })}
    />
  );
  if (block.type === "WorldsPrism")
    return (
      <div className="grid gap-3">
        {title}
        {number(
          "autoplaySeconds",
          block.autoplaySeconds,
          (autoplaySeconds) => change({ ...block, autoplaySeconds }),
          3,
          20,
          0.1,
        )}
        {block.faces.map((face, index) => (
          <fieldset key={face.id} className="card grid gap-3">
            <legend>{t("face", { number: index + 1 })}</legend>
            <label>
              {t("category")}
              <select
                className="input"
                value={face.categoryId}
                onChange={(event) =>
                  change({
                    ...block,
                    faces: block.faces.map((item, n) =>
                      n === index
                        ? { ...item, categoryId: event.target.value }
                        : item,
                    ),
                  })
                }
              >
                <option value="">{t("choose")}</option>
                {options.categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <LocalizedField
              label={t("title")}
              value={face.title}
              change={(title) =>
                change({
                  ...block,
                  faces: block.faces.map((item, n) =>
                    n === index ? { ...item, title } : item,
                  ),
                })
              }
            />
            <LocalizedField
              label={t("subtitle")}
              value={face.subtitle}
              change={(subtitle) =>
                change({
                  ...block,
                  faces: block.faces.map((item, n) =>
                    n === index ? { ...item, subtitle } : item,
                  ),
                })
              }
            />
            {picture(
              face.desktop,
              (desktop) =>
                change({
                  ...block,
                  faces: block.faces.map((item, n) =>
                    n === index ? { ...item, desktop } : item,
                  ),
                }),
              "desktop",
            )}
            {picture(
              face.mobile,
              (mobile) =>
                change({
                  ...block,
                  faces: block.faces.map((item, n) =>
                    n === index ? { ...item, mobile } : item,
                  ),
                }),
              "mobile",
            )}
            <label>
              <input
                type="checkbox"
                checked={Boolean(face.scene)}
                onChange={(event) =>
                  change({
                    ...block,
                    faces: block.faces.map((item, n) =>
                      n === index
                        ? {
                            ...item,
                            scene: event.target.checked
                              ? emptyModaScene()
                              : undefined,
                          }
                        : item,
                    ),
                  })
                }
              />
              {t("offersGarments")}
            </label>
            {face.scene &&
              sceneField(face.scene, (scene) =>
                change({
                  ...block,
                  faces: block.faces.map((item, n) =>
                    n === index ? { ...item, scene } : item,
                  ),
                }),
              )}
          </fieldset>
        ))}
      </div>
    );
  if (block.type === "Lookbook")
    return (
      <div className="grid gap-3">
        {title}
        {number(
          "autoplaySeconds",
          block.autoplaySeconds,
          (autoplaySeconds) => change({ ...block, autoplaySeconds }),
          3,
          30,
          0.1,
        )}
        {block.scenes.map((scene, index) => (
          <div key={scene.id}>
            {sceneField(scene, (scene) =>
              change({
                ...block,
                scenes: block.scenes.map((item, n) =>
                  n === index ? scene : item,
                ),
              }),
            )}
            <button
              type="button"
              className="button button-outline"
              disabled={block.scenes.length < 2}
              onClick={() =>
                change({
                  ...block,
                  scenes: block.scenes.filter((_, n) => n !== index),
                })
              }
            >
              {t("remove")}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button button-outline"
          disabled={block.scenes.length >= 12}
          onClick={() =>
            change({ ...block, scenes: [...block.scenes, emptyModaScene()] })
          }
        >
          {t("addLook")}
        </button>
      </div>
    );
  if (block.type === "Services")
    return (
      <div className="grid gap-2">
        {title}
        <a
          className="button button-outline"
          href="/admin/content/service-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("editServicePolicy")}
        </a>
        {(["shipping", "returns", "prices", "support"] as const).map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={block.keys.includes(key)}
              onChange={(event) =>
                change({
                  ...block,
                  keys: event.target.checked
                    ? [...block.keys, key]
                    : block.keys.filter((item) => item !== key),
                })
              }
            />
            {t(`service_${key}`)}
          </label>
        ))}
      </div>
    );
  const common = (
    <>
      {title}
      {"body" in block && (
        <LocalizedField
          label={t("body")}
          value={block.body}
          multiline
          change={(body) => change({ ...block, body })}
        />
      )}
      <LocalizedField
        label={t("ctaLabel")}
        value={block.ctaLabel}
        change={(ctaLabel) => change({ ...block, ctaLabel })}
      />
      <ModaTargetField
        value={block.target}
        change={(target) => change({ ...block, target })}
        options={options}
      />
    </>
  );
  if (block.type === "NewIn" || block.type === "KidsWorld")
    return (
      <div className="grid gap-3">
        {common}
        {sourceField(block.source, (source) => change({ ...block, source }))}
        {block.type === "KidsWorld" && (
          <label>
            {t("tone")}
            <select
              className="input"
              value={block.tone}
              onChange={(event) =>
                change({
                  ...block,
                  tone: event.target.value as typeof block.tone,
                })
              }
            >
              {(
                [
                  "kidsPink",
                  "kidsMint",
                  "kidsSky",
                  "kidsButter",
                  "kidsLilac",
                  "kidsPeach",
                ] as const
              ).map((tone) => (
                <option key={tone} value={tone}>
                  {t(`tone_${tone}`)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    );
  if (block.type === "FittingAd")
    return (
      <div className="grid gap-3">
        {common}
        {block.looks.map((look, index) => (
          <fieldset key={look.id} className="card grid gap-2">
            <legend>{t("look", { number: index + 1 })}</legend>
            <LocalizedField
              label={t("lookLabel")}
              value={look.label}
              change={(label) =>
                change({
                  ...block,
                  looks: block.looks.map((item, n) =>
                    n === index ? { ...item, label } : item,
                  ),
                })
              }
            />
            {sceneField(look.scene, (scene) =>
              change({
                ...block,
                looks: block.looks.map((item, n) =>
                  n === index ? { ...item, scene } : item,
                ),
              }),
            )}
            <label>
              <input
                type="checkbox"
                checked={Boolean(look.finalPhoto)}
                onChange={(event) =>
                  change({
                    ...block,
                    looks: block.looks.map((item, n) =>
                      n === index
                        ? {
                            ...item,
                            finalPhoto: event.target.checked
                              ? emptyModaScene()
                              : undefined,
                          }
                        : item,
                    ),
                  })
                }
              />
              {t("finalPhoto")}
            </label>
            {look.finalPhoto &&
              sceneField(look.finalPhoto, (finalPhoto) =>
                change({
                  ...block,
                  looks: block.looks.map((item, n) =>
                    n === index ? { ...item, finalPhoto } : item,
                  ),
                }),
              )}
            <button
              type="button"
              className="button button-outline"
              disabled={block.looks.length < 2}
              onClick={() =>
                change({
                  ...block,
                  looks: block.looks.filter((_, n) => n !== index),
                })
              }
            >
              {t("remove")}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="button button-outline"
          disabled={block.looks.length >= 4}
          onClick={() =>
            change({
              ...block,
              looks: [
                ...block.looks,
                { id: identity(), label: blank(), scene: emptyModaScene() },
              ],
            })
          }
        >
          {t("addLook")}
        </button>
      </div>
    );
  return (
    <div className="grid gap-3">
      {common}
      {picture(
        block.desktop,
        (desktop) => change({ ...block, desktop }),
        "desktop",
      )}
      {picture(
        block.mobile,
        (mobile) => change({ ...block, mobile }),
        "mobile",
      )}
      <label>
        <input
          type="checkbox"
          checked={Boolean(block.scene)}
          onChange={(event) =>
            change({
              ...block,
              scene: event.target.checked ? emptyModaScene() : undefined,
            })
          }
        />
        {t("offersGarments")}
      </label>
      {block.scene &&
        sceneField(
          block.type === "VideoBanner"
            ? { ...block.scene, relatedVideoMediaId: block.videoMediaId }
            : block.scene,
          (scene) => change({ ...block, scene }),
        )}
      {block.type === "Campaign" ? (
        <>
          <p>{t("campaignHelp")}</p>
          <label>
            {t("program")}
            <select
              className="input"
              value={block.programId}
              onChange={(event) =>
                change({ ...block, programId: event.target.value })
              }
            >
              <option value="">{t("choose")}</option>
              {options.programs
                .filter(
                  (program) => scope === "global" || program.marketId === scope,
                )
                .map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.title} — {program.state}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={block.countdown}
              onChange={(event) =>
                change({ ...block, countdown: event.target.checked })
              }
            />
            {t("countdown")}
          </label>
          <label>
            <input
              type="checkbox"
              checked={block.popup?.enabled ?? false}
              onChange={(event) =>
                change({
                  ...block,
                  popup: {
                    enabled: event.target.checked,
                    delaySeconds: block.popup?.delaySeconds ?? 10,
                    frequencyHours: block.popup?.frequencyHours ?? 24,
                  },
                })
              }
            />
            {t("popup")}
          </label>
          {block.popup?.enabled && (
            <>
              {number(
                "delaySeconds",
                block.popup.delaySeconds,
                (delaySeconds) =>
                  change({
                    ...block,
                    popup: { ...block.popup!, delaySeconds },
                  }),
                0,
                120,
              )}
              {number(
                "frequencyHours",
                block.popup.frequencyHours,
                (frequencyHours) =>
                  change({
                    ...block,
                    popup: { ...block.popup!, frequencyHours },
                  }),
                1,
                720,
              )}
            </>
          )}
          <a
            className="button button-outline"
            href="/admin/promotions"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("editPrograms")}
          </a>
        </>
      ) : (
        <>
          <MediaPicker
            key={block.videoMediaId}
            name="modaVideo"
            kind="video"
            label={t("video")}
            defaultMediaId={block.videoMediaId}
            defaultUrl={urls[block.videoMediaId]}
            onSelect={(id, url) => {
              onMedia(id, url);
              change({
                ...block,
                videoMediaId: id,
                ...(block.scene
                  ? { scene: { ...block.scene, relatedVideoMediaId: id } }
                  : {}),
              });
            }}
          />
          <label>
            <input
              type="checkbox"
              checked={block.mutedAutoplay}
              onChange={(event) =>
                change({ ...block, mutedAutoplay: event.target.checked })
              }
            />
            {t("mutedAutoplay")}
          </label>
        </>
      )}
    </div>
  );
}
