import { test, expect, type Page, type BrowserContext } from "@playwright/test";

async function uploadFile(
  page: Page,
  context: BrowserContext,
  opts: { name: string; body: string; description?: string; tags?: string },
) {
  const uploadPromise = page.waitForResponse(
    (resp) => resp.url().includes("/api/files") && resp.request().method() === "POST",
  );

  if (opts.tags) {
    await page.locator('input[placeholder*="tags"]').fill(opts.tags);
  }
  if (opts.description) {
    await page.locator('input[placeholder*="note"]').fill(opts.description);
  }

  await page.locator('input[name="file"]').setInputFiles({
    name: opts.name,
    mimeType: "text/plain",
    buffer: Buffer.from(opts.body),
  });
  const resp = await uploadPromise;
  expect(resp.status()).toBe(201);
  const body = (await resp.json()) as { file: { id: string } };
  return body.file.id;
}

async function closeSidebar(page: Page) {
  const backdrop = page.locator(".right-sidebar-backdrop");
  if (await backdrop.isVisible()) {
    await backdrop.click();
    await expect(backdrop).not.toBeVisible({ timeout: 5_000 });
  }
}

test.describe("Drive E2E", () => {
  test("paints the drive shell from the auth hint before the session probe resolves", async ({
    page,
  }) => {
    // Hold the session probe open so it cannot be what unblocks the UI.
    let releaseSession: (() => void) | undefined;
    const sessionPromise = new Promise<void>((resolve) => {
      releaseSession = resolve;
    });
    let sessionReleased = false;

    await page.route("/api/session", async (route) => {
      await sessionPromise;
      sessionReleased = true;
      await route.continue();
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // The auth-hint cookie (set on the document response for an authenticated
    // request) lets the real layout paint immediately — no "Checking session"
    // overlay — while the probe is still pending. This is the optimistic
    // Layer-2 paint; the probe still reconciles afterward.
    await expect(page.locator(".drive-layout")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Checking your Shedflare Drive session")).not.toBeVisible();
    expect(sessionReleased).toBe(false); // it painted before the probe resolved

    releaseSession?.();
    await expect(page.locator(".drive-layout")).toBeVisible();
  });

  test("falls back to the neutral session loader when there is no auth hint", async ({ page }) => {
    // Drop the optimistic auth hint before the app bundle reads it (init scripts
    // run after the document commits its Set-Cookie but before page scripts),
    // forcing the honest no-hint path so we exercise the safety-net loader
    // rather than the wrong shell.
    await page.addInitScript(() => {
      document.cookie = "auth_hint=; Max-Age=0; Path=/";
    });

    let releaseSession: (() => void) | undefined;
    const sessionPromise = new Promise<void>((resolve) => {
      releaseSession = resolve;
    });

    await page.route("/api/session", async (route) => {
      await sessionPromise;
      await route.continue();
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    // With no hint and the probe pending, show the neutral loader — never the
    // authenticated layout or file grid.
    await expect(page.locator(".session-overlay")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Checking your Shedflare Drive session")).toBeVisible();
    await expect(page.locator(".drive-layout")).not.toBeVisible();
    await expect(page.locator(".file-grid, .file-list")).not.toBeVisible();

    releaseSession?.();
    await expect(page.locator(".drive-layout")).toBeVisible({ timeout: 15_000 });
  });

  test("full drive lifecycle", async ({ page, context }) => {
    const ts = Date.now();
    const fileName = `e2e-lifecycle-${ts}.txt`;
    const renamedName = `e2e-renamed-${ts}.txt`;
    const fileBody = `Lifecycle test content ${ts}`;

    // ── Step 1: Upload with tags and description ──
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".file-card, .empty-state")).toBeVisible({ timeout: 15_000 });

    const fileId = await uploadFile(page, context, {
      name: fileName,
      body: fileBody,
      tags: `e2e, lifecycle-${ts}`,
      description: "Created by e2e lifecycle test",
    });
    await expect(page.getByRole("heading", { name: fileName })).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1000);

    // ── Step 2: Verify file in list with metadata ──
    const listResp = await context.request.get("/api/files?limit=100&offset=0");
    expect(listResp.status()).toBe(200);
    const listBody = (await listResp.json()) as {
      files: Array<{ id: string; name: string; tags: string[]; description: string }>;
    };
    const uploaded = listBody.files.find((f) => f.id === fileId);
    expect(uploaded).toBeDefined();
    expect(uploaded!.name).toBe(fileName);
    expect(uploaded!.tags).toContain("e2e");
    expect(uploaded!.description).toBe("Created by e2e lifecycle test");

    // ── Step 3: Download original content ──
    const dlResp = await context.request.get(`/api/files/${fileId}/download`);
    expect(dlResp.status()).toBe(200);
    expect(await dlResp.text()).toBe(fileBody);

    // ── Step 4: Rename file via UI ──
    await page.locator(`.file-card:has-text("${fileName}")`).click();
    await expect(page.locator(".right-sidebar.open")).toBeVisible({ timeout: 5_000 });
    await page.locator('.detail-actions button:has-text("Rename")').click();
    await closeSidebar(page);

    const renameInput = page.locator(".rename-input").first();
    await expect(renameInput).toBeVisible({ timeout: 5_000 });
    await renameInput.click();
    await renameInput.fill(renamedName);
    await renameInput.press("Enter");

    await expect(
      page.locator("article.file-card").getByRole("heading", { name: renamedName }),
    ).toBeVisible({ timeout: 10_000 });

    // Verify rename via API
    const fileResp = await context.request.get(`/api/files?limit=100&offset=0`);
    const fileList = (await fileResp.json()) as {
      files: Array<{ id: string; name: string }>;
    };
    expect(fileList.files.find((f) => f.id === fileId)!.name).toBe(renamedName);

    // ── Step 5: Search files (verify via API) ──
    const searchResp = await context.request.get(`/api/files?search=lifecycle-${ts}&limit=100`);
    expect(searchResp.status()).toBe(200);
    const searchBody = (await searchResp.json()) as { files: Array<{ id: string }> };
    expect(searchBody.files.find((f) => f.id === fileId)).toBeDefined();

    const emptyResp = await context.request.get(`/api/files?search=nonexistent-${ts}&limit=100`);
    const emptyBody = (await emptyResp.json()) as { files: Array<{ id: string }> };
    expect(emptyBody.files.find((f) => f.id === fileId)).toBeUndefined();

    // ── Step 6: Toggle public/private via UI ──
    await closeSidebar(page);
    await page.locator(`.file-card:has-text("${renamedName}")`).click();
    await expect(page.locator(".right-sidebar.open")).toBeVisible({ timeout: 5_000 });

    await page.locator('.detail-actions button:has-text("Make public")').click();
    await expect(page.locator(".share-state.public")).toBeVisible({ timeout: 5_000 });
    await closeSidebar(page);

    // ── Step 7: Public access works ──
    const publicDl = await context.request.get(`/public/files/${fileId}/download`);
    expect(publicDl.status()).toBe(200);
    expect(await publicDl.text()).toBe(fileBody);

    const pubListResp = await context.request.get("/api/public/files");
    expect(pubListResp.status()).toBe(200);
    const pubListBody = (await pubListResp.json()) as {
      files: Array<{ id: string; name: string }>;
    };
    expect(pubListBody.files.find((f) => f.id === fileId)).toBeDefined();

    const previewResp = await context.request.get(`/public/files/${fileId}/preview`);
    expect(previewResp.status()).toBe(200);
    expect(await previewResp.text()).toBe(fileBody);

    // ── Step 8: Make private again ──
    await page.locator(`.file-card:has-text("${renamedName}")`).click();
    await expect(page.locator(".right-sidebar.open")).toBeVisible({ timeout: 5_000 });

    await page.locator('.detail-actions button:has-text("Make private")').click();
    await expect(page.locator(".share-state:not(.public)")).toBeVisible({ timeout: 5_000 });
    await closeSidebar(page);

    const pub404 = await context.request.get(`/public/files/${fileId}/download`);
    expect(pub404.status()).toBe(404);

    // ── Step 9: Verify tags endpoint ──
    const tagsResp = await context.request.get("/api/tags");
    expect(tagsResp.status()).toBe(200);
    const tagsBody = (await tagsResp.json()) as { tags: Array<{ name: string; count: number }> };
    expect(tagsBody.tags.find((t) => t.name === `lifecycle-${ts}`)).toBeDefined();

    // ── Step 10: Delete via UI ──
    await page.locator(`.file-card:has-text("${renamedName}")`).click();
    await expect(page.locator(".right-sidebar.open")).toBeVisible({ timeout: 5_000 });

    await page.locator(".detail-actions .btn-danger").click();
    await expect(page.locator(".delete-modal")).toBeVisible({ timeout: 5_000 });
    await page.locator(".delete-modal .btn-danger").click();

    await expect(page.locator(`.file-card:has-text("${renamedName}")`)).not.toBeVisible({
      timeout: 10_000,
    });

    const dl404 = await context.request.get(`/api/files/${fileId}/download`);
    expect(dl404.status()).toBe(404);
  });
});
