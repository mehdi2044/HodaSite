// Opt-in fixture for this exact disposable copy, never a deploy hook.
import { db } from "../src/lib/db";
import { writeMenuItem } from "../src/modules/content/menu-writes";
import { menuItemInputSchema } from "../src/modules/content/validation";
import { seedEditorialFixtures } from "../tests/fixtures/editorial";

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
  if (database !== "curated_m402_final" || process.argv[2] !== database)
    throw new Error("Exact disposable M402 acceptance database required");
  await seedEditorialFixtures(db);
  const owner = await db.user.findFirstOrThrow({
    where: { isActive: true, roles: { some: { role: { key: "owner" } } } },
    select: { id: true },
  });
  const menus = await db.menu.findMany({
    where: { key: { in: ["header", "mobile"] }, deletedAt: null },
    include: { items: { where: { deletedAt: null } } },
  });
  if (!menus.some(({ key }) => key === "header"))
    throw new Error("Header menu missing");
  for (const menu of menus) {
    if (menu.items.some(({ url }) => url === "/magazine")) continue;
    await writeMenuItem(
      owner.id,
      menuItemInputSchema.parse({
        menuId: menu.id,
        labelI18n: {
          fa: "مجله مد و استایل",
          tr: "Moda ve Stil Dergisi",
          en: "Style Journal",
        },
        linkType: "url",
        url: "/magazine",
        target: "_self",
        enabled: true,
        visibleIn: [],
        sortOrder: Math.min(
          10000,
          Math.max(0, ...menu.items.map(({ sortOrder }) => sortOrder)) + 1,
        ),
      }),
    );
  }
  console.log(
    JSON.stringify({
      editorialFixture: true,
      auditedMenuConfiguration: true,
      configuredMenus: menus.length,
    }),
  );
}
main()
  .finally(() => db.$disconnect())
  .catch(() => {
    console.error("Isolated acceptance preparation failed");
    process.exitCode = 1;
  });
