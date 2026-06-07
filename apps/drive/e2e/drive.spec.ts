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

    // Dismiss toast
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

    // ── Step 4: Rename file ──
    const patchResp = await context.request.patch(`/api/files/${fileId}`, {
      data: { name: renamedName },
    });
    expect(patchResp.status()).toBe(200);
    const patchBody = (await patchResp.json()) as { file: { name: string } };
    expect(patchBody.file.name).toBe(renamedName);

    // Verify rename in UI
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText(renamedName)).toBeVisible({ timeout: 15_000 });

    // ── Step 5: Search files ──
    await page.locator('input[placeholder*="Search"]').fill(`lifecycle-${ts}`);
    await expect(page.getByText(renamedName)).toBeVisible({ timeout: 10_000 });

    await page.locator('input[placeholder*="Search"]').fill(`nonexistent-${ts}`);
    await expect(page.getByText(renamedName)).not.toBeVisible({ timeout: 10_000 });

    await page.locator('input[placeholder*="Search"]').fill("");
    await expect(page.getByText(renamedName)).toBeVisible({ timeout: 10_000 });

    // ── Step 6: Toggle public/private via UI ──
    await page.locator(`.file-card:has-text("${renamedName}")`).click();
    await expect(page.locator(".right-sidebar.open")).toBeVisible({ timeout: 5_000 });

    await page.locator('.detail-actions button:has-text("Make public")').click();
    await expect(page.locator(".share-state.public")).toBeVisible({ timeout: 5_000 });

    // Close sidebar to avoid blocking later clicks
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

    // Final verification: file gone from API
    const dl404 = await context.request.get(`/api/files/${fileId}/download`);
    expect(dl404.status()).toBe(404);
  });
});
