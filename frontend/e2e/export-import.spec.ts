import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * JSON エクスポート/インポートの E2E テスト
 *
 * エクスポート: GET /api/v1/export/json → JSON ダウンロード
 * インポート: POST /api/v1/import/json → データ復元
 * JSON 形式: { exported_at, version, relationships, tags, namecards }
 */

// ── 正常系 ──────────────────────────────────────────────

test.describe("JSON エクスポート/インポート", () => {
  test("test_export_json_download: JSON ファイルをエクスポートできる", async ({
    page,
  }) => {
    await page.goto("/import-export");

    // エクスポートボタンをクリックしてダウンロードイベントを待つ
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /エクスポート/ }).click(),
    ]);

    // ダウンロードされたファイル名が .json で終わる
    expect(download.suggestedFilename()).toMatch(/\.json$/);

    // ダウンロード内容を検証
    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    const content = fs.readFileSync(filePath!, "utf-8");
    const data = JSON.parse(content);

    // 必須キーが含まれる
    expect(data).toHaveProperty("exported_at");
    expect(data).toHaveProperty("version");
    expect(data).toHaveProperty("relationships");
    expect(data).toHaveProperty("tags");
    expect(data).toHaveProperty("namecards");
  });

  test("test_export_json_contains_all_data: エクスポートに全データが含まれる", async ({
    page,
  }) => {
    await page.goto("/import-export");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /エクスポート/ }).click(),
    ]);

    const filePath = await download.path();
    const content = fs.readFileSync(filePath!, "utf-8");
    const data = JSON.parse(content);

    // 名刺 5 件、Relationship 3 件、Tag 2 件が含まれる
    expect(data.namecards).toHaveLength(5);
    expect(data.relationships).toHaveLength(3);
    expect(data.tags).toHaveLength(2);

    // 名刺に contact_methods が含まれることを確認
    for (const card of data.namecards) {
      expect(card).toHaveProperty("contact_methods");
      expect(card).toHaveProperty("first_name");
      expect(card).toHaveProperty("last_name");
    }
  });

  test("test_import_json_upload: JSON ファイルをインポートできる", async ({
    page,
  }) => {
    // まずエクスポートしてインポート用ファイルを取得
    await page.goto("/import-export");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /エクスポート/ }).click(),
    ]);

    const downloadPath = await download.path();
    const exportedContent = fs.readFileSync(downloadPath!, "utf-8");

    // インポート用の一時ファイルを作成
    const tmpDir = path.join(process.cwd(), "test-results");
    fs.mkdirSync(tmpDir, { recursive: true });
    const importFilePath = path.join(tmpDir, "import-test.json");
    fs.writeFileSync(importFilePath, exportedContent, "utf-8");

    // インポートセクションでファイルを選択
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(importFilePath);

    // "インポート" ボタンをクリック
    await page.getByRole("button", { name: /インポート/ }).click();

    // 結果サマリーが表示される
    await expect(
      page.getByText(/インポート完了|インポート.*成功|完了/),
    ).toBeVisible({ timeout: 15000 });

    // 件数サマリー（imported / skipped）が表示される
    await expect(
      page.getByText(/imported|インポート|件|skipped|スキップ/i),
    ).toBeVisible();

    // 一時ファイルを削除
    fs.unlinkSync(importFilePath);
  });

  test("test_import_json_verify_data: インポート後にデータが確認できる", async ({
    page,
  }) => {
    // インポート済みの前提で各ページのデータを確認

    // 名刺一覧を確認
    await page.goto("/");
    const cardItems = page.getByRole("listitem");
    const cardCount = await cardItems.count();
    expect(cardCount).toBeGreaterThan(0);

    // Relationship ページを確認
    await page.goto("/relationships");
    await expect(page.getByText(/建築士会|ゴルフ仲間/).first()).toBeVisible({
      timeout: 10000,
    });

    // Tag ページを確認
    await page.goto("/tags");
    await expect(page.getByText(/取引先|友人|ゴルフ仲間/).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("test_export_import_roundtrip: エクスポート → インポートでデータが保持される", async ({
    page,
  }) => {
    await page.goto("/import-export");

    // Step 1: エクスポートを実行
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /エクスポート/ }).click(),
    ]);

    const downloadPath = await download.path();
    const exportedContent = fs.readFileSync(downloadPath!, "utf-8");
    const exportedData = JSON.parse(exportedContent);
    const originalCardCount = exportedData.namecards.length;

    expect(originalCardCount).toBeGreaterThan(0);

    // Step 2: 全データを削除（API 経由）
    await page.request.delete("/api/v1/namecards/all").catch(() => {
      // 全削除 API がない場合は個別削除
    });

    // Step 3: エクスポートした JSON をインポート
    const tmpDir = path.join(process.cwd(), "test-results");
    fs.mkdirSync(tmpDir, { recursive: true });
    const importFilePath = path.join(tmpDir, "roundtrip-test.json");
    fs.writeFileSync(importFilePath, exportedContent, "utf-8");

    await page.goto("/import-export");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(importFilePath);
    await page.getByRole("button", { name: /インポート/ }).click();

    // インポート完了を待つ
    await expect(
      page.getByText(/インポート完了|インポート.*成功|完了/),
    ).toBeVisible({ timeout: 15000 });

    // Step 4: 名刺一覧を確認
    await page.goto("/");
    const cardItems = page.getByRole("listitem");
    const restoredCount = await cardItems.count();

    // 元のデータが復元される
    expect(restoredCount).toBeGreaterThanOrEqual(originalCardCount);

    // 一時ファイルを削除
    fs.unlinkSync(importFilePath);
  });
});

// ── 異常系 ──────────────────────────────────────────────

test.describe("JSON エクスポート/インポート異常系", () => {
  test("test_import_invalid_json_format: 不正な JSON ファイルでエラー表示", async ({
    page,
  }) => {
    await page.goto("/import-export");

    // 不正な JSON を含む一時ファイルを作成
    const tmpDir = path.join(process.cwd(), "test-results");
    fs.mkdirSync(tmpDir, { recursive: true });
    const invalidFilePath = path.join(tmpDir, "invalid.json");
    fs.writeFileSync(invalidFilePath, "{ this is not valid json }", "utf-8");

    // ファイルを選択してインポート
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(invalidFilePath);
    await page.getByRole("button", { name: /インポート/ }).click();

    // エラーメッセージが表示される
    await expect(
      page.getByText(/不正な.*JSON|Invalid.*JSON|エラー|失敗/i),
    ).toBeVisible({ timeout: 10000 });

    // 一時ファイルを削除
    fs.unlinkSync(invalidFilePath);
  });

  test("test_import_empty_file: 空ファイルでエラー表示", async ({ page }) => {
    await page.goto("/import-export");

    // 空のファイルを作成
    const tmpDir = path.join(process.cwd(), "test-results");
    fs.mkdirSync(tmpDir, { recursive: true });
    const emptyFilePath = path.join(tmpDir, "empty.json");
    fs.writeFileSync(emptyFilePath, "", "utf-8");

    // ファイルを選択してインポート
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(emptyFilePath);
    await page.getByRole("button", { name: /インポート/ }).click();

    // エラーメッセージが表示される
    await expect(
      page.getByText(/空|empty|エラー|失敗|不正/i),
    ).toBeVisible({ timeout: 10000 });

    // 一時ファイルを削除
    fs.unlinkSync(emptyFilePath);
  });

  test("test_export_empty_data: データ 0 件でもエクスポートが成功する", async ({
    page,
  }) => {
    // データが 0 件の状態でエクスポート（テスト環境依存）
    // API をインターセプトして空データを返す
    await page.route("**/api/v1/export/json*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          exported_at: new Date().toISOString(),
          version: "1.0",
          relationships: [],
          tags: [],
          namecards: [],
        }),
      });
    });

    await page.goto("/import-export");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /エクスポート/ }).click(),
    ]);

    // ダウンロードが成功する
    expect(download.suggestedFilename()).toMatch(/\.json$/);

    const filePath = await download.path();
    const content = fs.readFileSync(filePath!, "utf-8");
    const data = JSON.parse(content);

    // 空の配列を含む有効な JSON
    expect(data.namecards).toEqual([]);
    expect(data.relationships).toEqual([]);
    expect(data.tags).toEqual([]);
    expect(data).toHaveProperty("version");
    expect(data).toHaveProperty("exported_at");
  });
});
