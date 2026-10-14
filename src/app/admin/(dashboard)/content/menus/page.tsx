import { redirect } from "next/navigation";
import { auth } from "@/modules/auth";
import { can } from "@/modules/access";
import { db } from "@/lib/db";
import { Card, Input } from "@/components/ui";
import { SettingsForm } from "@/components/admin/settings-form";
import { MenuOrder } from "@/components/admin/menu-order";
import { MenuPresentationEditor } from "@/components/admin/menu-presentation-editor";
import { MenuReferencePicker } from "@/components/admin/menu-reference-picker";
import { menuPresentation } from "@/modules/content";
import { ActionSubmit } from "@/components/admin/action-submit";
import { createMenuOverride, deleteMenuItem, saveMenuItem } from "./actions";
import { getTranslations, getLocale } from "next-intl/server";

export default async function MenusAdmin() {
  const t = await getTranslations("contentAdmin");
  const labels: MenuLabels = {
    addItem: t("addItem"),
    saveItem: t("saveItem"),
    delete: t("delete"),
    label: t("label"),
    linkType: t("linkType"),
    page: t("page"),
    reference: t("reference"),
    parent: t("parent"),
    root: t("root"),
    target: t("target"),
    sameTab: t("sameTab"),
    newTab: t("newTab"),
    visibility: t("visibility"),
    active: t("active"),
    categoryPhase2: t("categoryPhase2"),
    collectionPhase2: t("collectionPhase2"),
    headerLocation: t("headerLocation"),
    mobileLocation: t("mobileLocation"),
    footerLocation: t("footerLocation"),
    urlLabel: t("urlLabel"),
    menuImage: t("menuImage"),
    imageFit: t("imageFit"),
    imageTone: t("imageTone"),
    focalX: t("focalX"),
    focalY: t("focalY"),
    cover: t("cover"),
    contain: t("contain"),
  };
  const session = await auth();
  if (!session?.user?.id) redirect("/admin");
  const [allMenus, pages, markets, categories, collections, locale] =
    await Promise.all([
      db.menu.findMany({
        where: { deletedAt: null },
        include: {
          market: true,
          items: {
            where: { deletedAt: null },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
        orderBy: [{ key: "asc" }, { marketId: "asc" }],
      }),
      db.page.findMany({
        where: { deletedAt: null, status: "published" },
        orderBy: { createdAt: "asc" },
      }),
      db.market.findMany({ orderBy: { code: "asc" } }),
      db.category.findMany({
        where: { deletedAt: null },
        select: { id: true, titleI18n: true },
        orderBy: { sortOrder: "asc" },
      }),
      db.collection.findMany({
        where: { deletedAt: null },
        select: { id: true, titleI18n: true },
        orderBy: { createdAt: "asc" },
      }),
      getLocale(),
    ]);
  const readable = await Promise.all(
    allMenus.map((menu) =>
      can(
        session.user.id,
        "content.menu.read",
        menu.marketId ? { marketId: menu.marketId } : undefined,
      ),
    ),
  );
  const menus = allMenus.filter((_, index) => readable[index]);
  const writable = await Promise.all(
    menus.map((menu) =>
      can(
        session.user.id,
        "content.menu.write",
        menu.marketId ? { marketId: menu.marketId } : undefined,
      ),
    ),
  );
  const marketWrites = await Promise.all(
    markets.map((market) =>
      can(session.user.id, "content.menu.write", { marketId: market.id }),
    ),
  );
  const writableMarkets = markets.filter((_, index) => marketWrites[index]);
  if (!menus.length && !writableMarkets.length) redirect("/admin");
  const mediaIds = menus.flatMap((menu) =>
    menu.items.flatMap((item) =>
      menuPresentation(item.presentation).mediaId
        ? [menuPresentation(item.presentation).mediaId!]
        : [],
    ),
  );
  const images = mediaIds.length
    ? await db.media.findMany({
        where: {
          id: { in: mediaIds },
          kind: "image",
          status: "READY",
          deletedAt: null,
        },
        select: { id: true, url: true },
      })
    : [];
  return (
    <>
      <h1 className="text-2xl font-semibold">{t("menus")}</h1>
      <p className="mt-2 text-muted">{t("menusDescription")}</p>
      {writableMarkets.length > 0 && (
        <Card className="mt-5 max-w-2xl">
          <SettingsForm
            action={createMenuOverride}
            submitLabel={t("createOverride")}
          >
            <div className="grid gap-2 md:grid-cols-2">
              <label>
                {t("location")}
                <select className="input" name="key">
                  <option value="header">{t("headerLocation")}</option>
                  <option value="mobile">{t("mobileLocation")}</option>
                  <option value="footer">{t("footerLocation")}</option>
                </select>
              </label>
              <label>
                {t("market")}
                <select className="input" name="marketId">
                  {writableMarkets.map((market) => (
                    <option key={market.id} value={market.id}>
                      {market.code}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </SettingsForm>
        </Card>
      )}
      <div className="mt-5 grid gap-6">
        {menus.map((menu, index) => {
          const roots = menu.items.filter((item) => !item.parentId);
          return (
            <Card key={menu.id} className="grid gap-5">
              <fieldset disabled={!writable[index]} className="grid gap-5">
                <div>
                  <h2 className="text-xl font-semibold">{menu.key}</h2>
                  <p className="muted">{menu.market?.code ?? t("global")}</p>
                </div>
                {roots.length > 0 && (
                  <MenuOrder
                    menuId={menu.id}
                    items={roots.map((item) => ({
                      id: item.id,
                      label:
                        (item.labelI18n as Record<string, string>).fa ||
                        item.id,
                    }))}
                    labels={{
                      help: t("reorderHelp"),
                      up: t("moveUp"),
                      down: t("moveDown"),
                      save: t("saveOrder"),
                      saved: t("orderSaved"),
                    }}
                  />
                )}
                {roots.map((root) => {
                  const children = menu.items.filter(
                    (item) => item.parentId === root.id,
                  );
                  return children.length ? (
                    <div key={`order-${root.id}`} className="ms-6">
                      <p className="mb-2 font-semibold">
                        {(root.labelI18n as Record<string, string>).fa}
                      </p>
                      <MenuOrder
                        menuId={menu.id}
                        parentId={root.id}
                        items={children.map((item) => ({
                          id: item.id,
                          label:
                            (item.labelI18n as Record<string, string>).fa ||
                            item.id,
                        }))}
                        labels={{
                          help: t("reorderHelp"),
                          up: t("moveUp"),
                          down: t("moveDown"),
                          save: t("saveOrder"),
                          saved: t("orderSaved"),
                        }}
                      />
                    </div>
                  ) : null;
                })}
                <div className="grid gap-4">
                  {menu.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-token border border-black/10 p-4"
                    >
                      <MenuItemForm
                        menuId={menu.id}
                        item={item}
                        roots={roots.filter((root) => root.id !== item.id)}
                        pages={pages}
                        labels={labels}
                        categories={categories}
                        collections={collections}
                        locale={locale}
                        mediaUrl={
                          images.find(
                            (image) =>
                              image.id ===
                              menuPresentation(item.presentation).mediaId,
                          )?.url
                        }
                      />
                      <div className="mt-2">
                        <ActionSubmit
                          action={deleteMenuItem}
                          fields={{ id: item.id }}
                          label={t("delete")}
                          variant="destructive"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <details>
                  <summary className="min-h-11 cursor-pointer font-semibold">
                    {t("addItem")}
                  </summary>
                  <MenuItemForm
                    menuId={menu.id}
                    roots={roots}
                    pages={pages}
                    labels={labels}
                    categories={categories}
                    collections={collections}
                    locale={locale}
                  />
                </details>
              </fieldset>
            </Card>
          );
        })}
      </div>
    </>
  );
}

type Item = {
  id: string;
  parentId: string | null;
  labelI18n: unknown;
  linkType: string;
  url: string | null;
  pageId: string | null;
  referenceId: string | null;
  target: string;
  enabled: boolean;
  visibleIn: string[];
  sortOrder: number;
  presentation?: unknown;
  updatedAt: Date;
};
type PageOption = { id: string; titleI18n: unknown };
type MenuLabels = Record<
  | "addItem"
  | "saveItem"
  | "delete"
  | "label"
  | "linkType"
  | "page"
  | "reference"
  | "parent"
  | "root"
  | "target"
  | "sameTab"
  | "newTab"
  | "visibility"
  | "active"
  | "categoryPhase2"
  | "collectionPhase2"
  | "headerLocation"
  | "mobileLocation"
  | "footerLocation"
  | "urlLabel"
  | "menuImage"
  | "imageFit"
  | "imageTone"
  | "focalX"
  | "focalY"
  | "cover"
  | "contain",
  string
>;

function MenuItemForm({
  menuId,
  item,
  roots,
  pages,
  labels,
  mediaUrl,
  categories,
  collections,
  locale,
}: {
  menuId: string;
  item?: Item;
  roots: Item[];
  pages: PageOption[];
  labels: MenuLabels;
  mediaUrl?: string;
  categories: PageOption[];
  collections: PageOption[];
  locale: string;
}) {
  const label = (item?.labelI18n as Record<string, string> | undefined) ?? {};
  return (
    <SettingsForm
      action={saveMenuItem}
      submitLabel={item ? labels.saveItem : labels.addItem}
      className="grid gap-3"
    >
      <input type="hidden" name="menuId" value={menuId} />
      {item && <input type="hidden" name="id" value={item.id} />}
      {item && (
        <input
          type="hidden"
          name="expectedUpdatedAt"
          value={item.updatedAt.toISOString()}
        />
      )}
      <MenuPresentationEditor initial={item?.presentation} url={mediaUrl} />
      <div className="grid gap-2 md:grid-cols-3">
        {(["fa", "tr", "en"] as const).map((locale) => (
          <label key={locale}>
            {labels.label} ({locale})
            <Input
              name={`label${locale[0].toUpperCase() + locale.slice(1)}`}
              defaultValue={label[locale]}
              required
            />
          </label>
        ))}
      </div>
      <MenuReferencePicker
        initial={{
          linkType: item?.linkType ?? "url",
          url: item?.url ?? null,
          pageId: item?.pageId ?? null,
          referenceId: item?.referenceId ?? null,
        }}
        categories={categories}
        collections={collections}
        pages={pages}
        locale={locale}
      />
      <div className="grid gap-2 md:grid-cols-2">
        <label>
          {labels.parent}
          <select
            className="input"
            name="parentId"
            defaultValue={item?.parentId ?? ""}
          >
            <option value="">{labels.root}</option>
            {roots.map((root) => (
              <option key={root.id} value={root.id}>
                {(root.labelI18n as Record<string, string>).fa}
              </option>
            ))}
          </select>
        </label>
        <label>
          {labels.target}
          <select
            className="input"
            name="target"
            defaultValue={item?.target ?? "_self"}
          >
            <option value="_self">{labels.sameTab}</option>
            <option value="_blank">{labels.newTab}</option>
          </select>
        </label>
      </div>
      <input type="hidden" name="sortOrder" value={item?.sortOrder ?? 999} />
      <fieldset>
        <legend>{labels.visibility}</legend>
        {["IR", "TR", "CA"].map((market) => (
          <label key={market} className="ms-4">
            <input
              type="checkbox"
              name="visibleIn"
              value={market}
              defaultChecked={item?.visibleIn.includes(market)}
            />{" "}
            {market}
          </label>
        ))}
      </fieldset>
      <label>
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={item?.enabled ?? true}
        />{" "}
        {labels.active}
      </label>
    </SettingsForm>
  );
}
