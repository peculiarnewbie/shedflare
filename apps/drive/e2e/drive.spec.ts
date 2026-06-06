import { test, expect } from "@playwright/test";

const authEmail = process.env.E2E_AUTH_EMAIL ?? "test@example.com";

test.describe("Drive E2E", () => {
  test("upload, download, publish, and access public file", async ({
    page,
    context,
  }) => {
    const fileName = `shedflare-e2e-${Date.now()}.txt`;
    const fileBody = `Shedflare Drive E2E ${new Date().toISOString()}`;

    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.getByText(authEmail)).toBeVisible({ timeout: 15_000 });

    // Wait for the upload API call after setting the file
    const uploadPromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/files") && resp.request().method() === "POST",
    );
    await page.locator('input[name="file"]').setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from(fileBody),
    });
    const uploadResponse = await uploadPromise;
    expect(uploadResponse.status(), "upload POST should succeed").toBe(201);

    // Wait for file to appear in the list
    await expect(page.getByText(fileName)).toBeVisible({ timeout: 20_000 });

    // Verify file appears in API listing
    const filesResponse = await context.request.get("/api/files?limit=30&offset=0");
    expect(filesResponse.status()).toBe(200);
    const filesBody = (await filesResponse.json()) as {
      files: Array<{ id: string; name: string }>;
    };
    const uploaded = filesBody.files.find((file) => file.name === fileName);
    expect(uploaded, "uploaded file should be returned by /api/files").toBeDefined();

    // Download file content
    const downloadResponse = await context.request.get(
      `/api/files/${uploaded!.id}/download`,
    );
    expect(downloadResponse.status()).toBe(200);
    expect(await downloadResponse.text()).toBe(fileBody);

    // Publish file
    const publishResponse = await context.request.patch(
      `/api/files/${uploaded!.id}`,
      { data: { isPublic: true } },
    );
    expect(publishResponse.status()).toBe(200);

    // Access public download
    const publicResponse = await context.request.get(
      `/public/files/${uploaded!.id}/download`,
    );
    expect(publicResponse.status()).toBe(200);
    expect(await publicResponse.text()).toBe(fileBody);
  });
});
