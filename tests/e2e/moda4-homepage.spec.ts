import { test, expect } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";
import en from "../../messages/en.json";
import { fillAdminMfa } from "./helpers/admin-mfa";
const db = new PrismaClient();
test.use({ viewport: { width: 390, height: 844 }, actionTimeout: 20000 });
test("R3b full real CMS: private unsaved renderer, ordered blocks and publication visible in open storefront", async ({
  page,
  context,
}, info) => {
  test.setTimeout(180000);
  const market = await db.market.findUniqueOrThrow({ where: { code: "CA" } });
  const previous = await db.homepage.findFirst({
    where: { marketId: market.id },
  });
  const shop = await context.newPage();
  try {
    await context.addCookies([
      { name: "market", value: "CA", url: info.project.use.baseURL! },
    ]);
    await page.goto("/admin/login");
    await page
      .locator('input[name="email"]')
      .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
    await page
      .locator('input[name="password"]')
      .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
    await fillAdminMfa(page);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/admin(?:\/|$)/);
    await context.addCookies([
      {
        name: "hoda.admin.locale",
        value: "en",
        url: info.project.use.baseURL!,
      },
    ]);
    await shop.goto("/en/m/CA");
    await page.goto(`/admin/content/homepage?scope=${market.id}`);
    const form = page.getByTestId("homepage-form");
    const type = form.getByRole("combobox", {
      name: en.homepageAdmin.add,
      exact: true,
    });
    await type.selectOption("NewIn");
    await form
      .getByRole("button", { name: en.homepageAdmin.add, exact: true })
      .click();
    const block = form.locator("details").last();
    await block
      .locator("fieldset.moda-localized-fields")
      .first()
      .locator("input")
      .nth(0)
      .fill("تازه‌های آزمون");
    await block
      .locator("fieldset.moda-localized-fields")
      .first()
      .locator("input")
      .nth(1)
      .fill("Deneme yenileri");
    await block
      .locator("fieldset.moda-localized-fields")
      .first()
      .locator("input")
      .nth(2)
      .fill("R3b new arrivals proof");
    await block
      .getByRole("combobox", { name: en.modaAdmin.source, exact: true })
      .selectOption("manual");
    await block
      .locator(".moda-manual-products label")
      .filter({ hasText: "" })
      .first()
      .locator("input")
      .check();
    await page
      .getByRole("combobox", {
        name: en.modaAdmin.previewLanguage,
        exact: true,
      })
      .selectOption("en");
    const preview = page.getByTestId("homepage-unsaved-preview").contentFrame();
    await expect(
      preview.getByRole("heading", {
        name: "R3b new arrivals proof",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      shop.getByRole("heading", {
        name: "R3b new arrivals proof",
        exact: true,
      }),
    ).toHaveCount(0);
    await block
      .getByRole("button", { name: en.modaAdmin.clone, exact: true })
      .click();
    expect(await form.locator("details").count()).toBeGreaterThan(1);
    const copy = form.locator("details").last();
    await copy
      .locator("fieldset.moda-localized-fields")
      .first()
      .locator("input")
      .nth(2)
      .fill("R3b duplicate proof");
    await copy
      .getByRole("checkbox", { name: en.modaAdmin.enabled, exact: true })
      .uncheck();
    await copy
      .getByRole("button", { name: en.homepageAdmin.remove, exact: true })
      .click();
    await form
      .getByRole("button", { name: en.modaAdmin.restoreRemoved, exact: true })
      .click();
    await expect(
      form
        .locator("details")
        .last()
        .getByRole("checkbox", { name: en.modaAdmin.enabled, exact: true }),
    ).not.toBeChecked();
    await form
      .getByRole("button", { name: en.homepageAdmin.save, exact: true })
      .click();
    await expect(
      form.getByRole("status").filter({ hasText: en.modaAdmin.saved }),
    ).toBeVisible();
    await page.reload();
    const saved = await db.homepage.findFirstOrThrow({
      where: { marketId: market.id },
    });
    expect(JSON.stringify(saved.draftBlocks)).toContain(
      "R3b new arrivals proof",
    );
    expect(JSON.stringify(saved.blocks)).not.toContain(
      "R3b new arrivals proof",
    );
    await page
      .getByTestId("homepage-form")
      .getByRole("button", { name: en.scenes.publishChanges, exact: true })
      .click();
    await expect(
      shop.getByRole("heading", {
        name: "R3b new arrivals proof",
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      shop.getByRole("heading", { name: "R3b duplicate proof", exact: true }),
    ).toHaveCount(0);
    await shop.screenshot({
      scale: "css",
      path: test.info().outputPath("r3b-cms-public-390.png"),
      fullPage: true,
    });
    for (const locale of ["fa", "tr", "en"]) {
      await shop.goto(`/${locale}/m/CA`);
      await expect(shop.locator("main")).toBeVisible();
      expect(
        await shop.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    }
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1920, height: 800 },
    ]) {
      await shop.setViewportSize(viewport);
      for (const locale of ["fa", "tr", "en"]) {
        await shop.goto(`/${locale}/m/CA`);
        await shop.evaluate(() => document.fonts.ready);
        expect(
          await shop.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        if (await shop.locator(".moda-carousel-hero").count()) {
          await expect
            .poll(() =>
              shop
                .locator(".moda-carousel-hero .moda-scene-heading:visible")
                .first()
                .evaluate((heading) =>
                  [
                    heading,
                    ...heading.querySelectorAll(".moda-title-fragment"),
                  ].every(
                    (element) =>
                      Number(getComputedStyle(element).opacity) >= 0.99,
                  ),
                ),
            )
            .toBe(true);
          await shop.evaluate(() => scrollTo(0, 0));
          await shop.screenshot({
            scale: "css",
            path: info.outputPath(`r3b-hero-${locale}-${viewport.width}.png`),
          });
          if (viewport.width === 1440 && locale === "fa")
            await shop
              .locator(".moda-carousel-prism")
              .screenshot({ path: info.outputPath("r3b-worlds-fa-1440.png") });
        }
      }
    }
    const motion = shop.locator(".moda-fitting-motion:visible").first();
    if (await motion.count()) {
      await shop.bringToFront();
      await motion.scrollIntoViewIfNeeded();
      await shop.mouse.move(0, 0);
      await expect(motion).toHaveAttribute("data-running", "true");
      await expect
        .poll(() => motion.locator(".moda-fitting-flight").count())
        .toBeGreaterThan(0);
      await shop.emulateMedia({ reducedMotion: "reduce" });
      await expect(motion).toHaveAttribute("data-running", "false");
      await expect(motion.locator(".moda-fitting-flight")).toHaveCount(0);
      await motion.screenshot({
        scale: "css",
        path: info.outputPath("r3b-fitting-static-fa-1920.png"),
      });
    }
  } finally {
    if (previous) {
      const { id, createdAt, updatedAt, ...rest } = previous;
      void createdAt;
      void updatedAt;
      await db.homepage.update({
        where: { id },
        data: {
          ...rest,
          blocks: rest.blocks as Prisma.InputJsonValue,
          draftBlocks:
            rest.draftBlocks === null
              ? Prisma.DbNull
              : (rest.draftBlocks as Prisma.InputJsonValue),
        },
      });
    } else {
      // This is an owned *_test DB: remove only the homepage created by this test.
      await db.homepage.deleteMany({ where: { marketId: market.id } });
    }
    await shop.close();
  }
});

// This case controls chunk transport to exercise an actual media failure before
// hydration. Keep service-worker behavior in the dedicated, unchanged PWA specs.
test.describe("controlled video transport", () => {
  test.use({ serviceWorkers: "block" });
  test("R3b actual bounded video upload, CMS selection, manual playback and broken-source fallback", async ({
    page,
    context,
  }, info) => {
    test.setTimeout(120000);
    const market = await db.market.findUniqueOrThrow({ where: { code: "CA" } });
    const previous = await db.homepage.findFirst({
      where: { marketId: market.id },
    });
    let uploaded = "";
    try {
      await page.goto("/admin/login");
      await page
        .locator('input[name="email"]')
        .fill(process.env.ADMIN_EMAIL ?? "owner@example.com");
      await page
        .locator('input[name="password"]')
        .fill(process.env.ADMIN_PASSWORD ?? "ChangeMe123!");
      await fillAdminMfa(page);
      await page.locator('button[type="submit"]').click();
      await expect(page).toHaveURL(/\/admin$/);
      await context.addCookies([
        {
          name: "hoda.admin.locale",
          value: "en",
          url: info.project.use.baseURL!,
        },
      ]);
      // Synthetic moving-colour clip recorded locally, not content from an owner/provider.
      const bytes = await page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 120;
        const ctx = canvas.getContext("2d")!;
        const stream = canvas.captureStream(20);
        const recorder = new MediaRecorder(stream, {
          mimeType: "video/webm;codecs=vp8",
        });
        const chunks: Blob[] = [];
        const complete = new Promise<Blob>((resolve) => {
          recorder.ondataavailable = (e) => chunks.push(e.data);
          recorder.onstop = () =>
            resolve(new Blob(chunks, { type: "video/webm" }));
        });
        recorder.start();
        for (let n = 0; n < 6; n++) {
          ctx.fillStyle = n % 2 ? "#336699" : "#669933";
          ctx.fillRect(0, 0, 160, 120);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        recorder.stop();
        const clip = await complete;
        stream.getTracks().forEach((track) => track.stop());
        return [...new Uint8Array(await clip.arrayBuffer())];
      });
      const upload = await page.request.post("/api/uploads", {
        multipart: {
          file: {
            name: "r3b-technical-motion.webm",
            mimeType: "image/jpeg",
            buffer: Buffer.from(bytes),
          },
        },
      });
      expect(upload.status()).toBe(202);
      const media = (await upload.json()) as {
        id: string;
        url: string;
        status: string;
      };
      uploaded = media.id;
      expect(media.status).toBe("READY");
      expect(
        await db.media.findUnique({
          where: { id: media.id },
          select: { kind: true, mime: true },
        }),
      ).toEqual({ kind: "video", mime: "video/webm" });
      const forged = await page.request.post("/api/uploads", {
        multipart: {
          file: {
            name: "forged.webm",
            mimeType: "video/webm",
            buffer: Buffer.from("not video bytes"),
          },
        },
      });
      expect(forged.status()).toBe(415);
      const tooLarge = await page.request.post("/api/uploads", {
        multipart: {
          file: {
            name: "oversize.webm",
            mimeType: "video/webm",
            buffer: Buffer.alloc(30_000_001),
          },
        },
      });
      expect(tooLarge.status()).toBe(400);
      await page.goto(`/admin/content/homepage?scope=${market.id}`);
      const form = page.getByTestId("homepage-form");
      await form
        .getByRole("combobox", { name: en.homepageAdmin.add, exact: true })
        .selectOption("VideoBanner");
      await form
        .getByRole("button", { name: en.homepageAdmin.add, exact: true })
        .click();
      const block = form.locator("details").last();
      for (const input of await block
        .locator(
          "fieldset.moda-localized-fields input,fieldset.moda-localized-fields textarea",
        )
        .all())
        await input.fill("R3b technical video proof");
      const poster = await db.media.findUniqueOrThrow({
        where: { id: "seed-fashion-v2-look-women-coat" },
      });
      for (const kind of ["desktop", "mobile"] as const) {
        const picker = block.locator("fieldset").filter({
          has: page.locator(`input[name="modaMedia-${en.modaAdmin[kind]}"]`),
        });
        await picker
          .getByRole("button", { name: en.media.chooseMedia })
          .click();
        await picker
          .locator("dialog input[type=search]")
          .fill(poster.originalName);
        await picker.getByTestId(`media-picker-item-${poster.id}`).click();
      }
      // Find the actual picker wrapper from its hidden selected-ID field.
      const videoField = block.locator('input[name="modaVideo"]').locator("..");
      await videoField
        .getByRole("button", { name: en.media.chooseMedia })
        .click();
      const dialog = videoField.locator("dialog");
      await dialog.locator("input[type=search]").fill("r3b-technical-motion");
      await dialog.getByTestId(`media-picker-item-${media.id}`).click();
      await page
        .getByRole("combobox", { name: en.modaAdmin.previewLanguage })
        .selectOption("en");
      const preview = page
        .getByTestId("homepage-unsaved-preview")
        .contentFrame();
      const player = preview.locator(`video[src="${media.url}"]`);
      await expect(player).toBeVisible();
      await player.evaluate(async (video: HTMLVideoElement) => {
        video.preload = "auto";
        video.muted = true;
        await video.play();
      });
      await expect
        .poll(() =>
          player.evaluate((video: HTMLVideoElement) => video.videoWidth),
        )
        .toBe(160);
      await player.evaluate((video: HTMLVideoElement) => video.pause());
      await page.emulateMedia({ reducedMotion: "reduce" });
      await form
        .getByRole("button", { name: en.homepageAdmin.save, exact: true })
        .click();
      await expect(
        form.getByRole("status").filter({ hasText: en.modaAdmin.saved }),
      ).toBeVisible();
      await page.reload();
      await page
        .getByTestId("homepage-form")
        .getByRole("button", { name: en.scenes.publishChanges })
        .click();
      const shop = await context.newPage();
      await shop.emulateMedia({ reducedMotion: "reduce" });
      await shop.goto("/en/m/CA");
      const publicPlayer = shop.locator(`video[src="${media.url}"]`);
      await expect(publicPlayer).toBeVisible();
      expect(
        await publicPlayer.evaluate((video: HTMLVideoElement) => video.paused),
      ).toBe(true);
      const missingUrl = `/media/media/2026/10/missing-technical-video-${media.id}.webm`;
      await db.media.update({
        where: { id: media.id },
        data: { url: missingUrl },
      });
      expect((await shop.request.get(missingUrl)).status()).toBe(404);
      // Make the real 404 finish before hydration. Media errors are not replayed
      // by React: a component must also inspect the element's existing error.
      const chunks = /\/_next\/static\/chunks\/.*\.js(?:\?.*)?$/;
      let releaseScripts!: () => void;
      const hydrationGate = new Promise<void>((resolve) => {
        releaseScripts = resolve;
      });
      let heldChunks = 0;
      await shop.route(chunks, async (route) => {
        heldChunks++;
        await hydrationGate;
        await route.continue();
      });
      const missingPlayer = shop.locator(".moda-video-banner video");
      try {
        await shop.reload({ waitUntil: "commit" });
        await expect.poll(() => heldChunks).toBeGreaterThan(0);
        await expect(missingPlayer).toHaveAttribute("src", missingUrl);
        await missingPlayer.evaluate((video: HTMLVideoElement) => {
          video.preload = "auto";
          video.load();
        });
        await expect
          .poll(() =>
            missingPlayer.evaluate(
              (video: HTMLVideoElement) => video.error?.code,
            ),
          )
          .toBe(4);
      } finally {
        releaseScripts();
        await shop.unrouteAll({ behavior: "wait" });
      }
      await expect(missingPlayer).toHaveCount(0);
      await expect(shop.locator(".moda-video-poster")).toContainText(
        "R3b technical video proof",
      );
      await shop.screenshot({
        scale: "css",
        path: info.outputPath("r3b-video-fallback-390.png"),
        fullPage: true,
      });
      await shop.close();
    } finally {
      if (previous) {
        const { id, createdAt, updatedAt, ...data } = previous;
        void createdAt;
        void updatedAt;
        await db.homepage.update({
          where: { id },
          data: {
            ...data,
            blocks: data.blocks as Prisma.InputJsonValue,
            draftBlocks:
              data.draftBlocks === null
                ? Prisma.DbNull
                : (data.draftBlocks as Prisma.InputJsonValue),
          },
        });
      } else await db.homepage.deleteMany({ where: { marketId: market.id } });
      if (uploaded)
        await db.media.update({
          where: { id: uploaded },
          data: { deletedAt: new Date() },
        });
    }
  });
});
