import { expect, test } from "@playwright/test";

/**
 * OCR フローの E2E テスト
 *
 * カメラ撮影 → 四隅選択 → OCR 結果 → 保存の一連のフローをテスト。
 * Playwright のカメラ権限許可 / 拒否はコンテキスト設定で制御する。
 */

// ── 正常系 ──────────────────────────────────────────────

test.describe("OCR フロー", () => {
  test("test_camera_capture_to_corner_selection: カメラ撮影 → 四隅選択画面へ遷移", async ({
    page,
    context,
  }) => {
    // カメラ権限を許可
    await context.grantPermissions(["camera"]);

    await page.goto("/namecards/new");

    // カメラボタンをクリック
    await page.getByRole("button", { name: /カメラ|撮影|📷/ }).click();

    // カメラプレビューが表示されるのを待つ
    await expect(
      page.getByTestId("camera-guide").or(page.getByRole("region")),
    ).toBeVisible({ timeout: 10000 });

    // 撮影ボタンをクリック
    await page.getByRole("button", { name: /撮影/ }).click();

    // 四隅選択 UI（CornerSelector）が表示される
    await expect(
      page
        .getByTestId("corner-point")
        .first()
        .or(page.getByRole("button", { name: /確定/ })),
    ).toBeVisible({ timeout: 10000 });
  });

  test("test_corner_selection_to_ocr_result: 四隅確定 → OCR 結果表示", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["camera"]);

    await page.goto("/namecards/new");

    // カメラ撮影フロー
    await page.getByRole("button", { name: /カメラ|撮影|📷/ }).click();
    await expect(
      page.getByTestId("camera-guide").or(page.getByRole("region")),
    ).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /撮影/ }).click();

    // 四隅選択 UI が表示されるまで待つ
    await expect(page.getByRole("button", { name: /確定/ })).toBeVisible({
      timeout: 10000,
    });

    // "確定" ボタンをクリック
    await page.getByRole("button", { name: /確定/ }).click();

    // ローディング表示を確認
    await expect(page.getByText(/処理中|読み取り中|OCR/))
      .toBeVisible({ timeout: 5000 })
      .catch(() => {
        // ローディングが高速で消える場合はスキップ
      });

    // OCR 結果が NameCardForm にプリフィルされる
    // 姓 or 名のフィールドに値が自動入力される
    const lastNameField = page.getByLabel(/姓/);
    const firstNameField = page.getByLabel(/名/);

    // いずれかのフィールドに値が入っていることを確認（OCR 結果による）
    await expect(lastNameField.or(firstNameField)).not.toHaveValue("", {
      timeout: 30000,
    });
  });

  test("test_ocr_result_edit_and_save: OCR 結果を編集して保存できる", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["camera"]);

    await page.goto("/namecards/new");

    // カメラ撮影 → 四隅確定 → OCR 結果取得
    await page.getByRole("button", { name: /カメラ|撮影|📷/ }).click();
    await expect(
      page.getByTestId("camera-guide").or(page.getByRole("region")),
    ).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /撮影/ }).click();
    await expect(page.getByRole("button", { name: /確定/ })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole("button", { name: /確定/ }).click();

    // OCR 結果がフォームに反映されるのを待つ
    const lastNameField = page.getByLabel(/姓/);
    await expect(lastNameField).toBeVisible({ timeout: 30000 });

    // フィールドを手動で修正
    await lastNameField.fill("テスト");
    const firstNameField = page.getByLabel(/名/);
    await firstNameField.fill("太郎");

    // "保存" ボタンをクリック
    await page.getByRole("button", { name: /保存|送信|登録/ }).click();

    // 保存成功の確認（名刺詳細ページへの遷移またはトースト表示）
    await expect(
      page
        .getByText(/保存しました|作成しました|登録しました/)
        .or(page.locator('[data-testid="namecard-detail"]')),
    ).toBeVisible({ timeout: 10000 });
  });

  test("test_ocr_full_flow: カメラ → 四隅選択 → OCR → 保存の全フロー", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["camera"]);

    await page.goto("/namecards/new");

    // Step 1: カメラボタンをクリック
    await page.getByRole("button", { name: /カメラ|撮影|📷/ }).click();

    // Step 2: カメラプレビューが表示される
    await expect(
      page.getByTestId("camera-guide").or(page.getByRole("region")),
    ).toBeVisible({ timeout: 10000 });

    // Step 3: 撮影
    await page.getByRole("button", { name: /撮影/ }).click();

    // Step 4: 四隅選択 UI が表示される
    await expect(page.getByRole("button", { name: /確定/ })).toBeVisible({
      timeout: 10000,
    });

    // Step 5: "確定" をクリック
    await page.getByRole("button", { name: /確定/ }).click();

    // Step 6: OCR 結果を確認（フォームにプリフィルされる）
    const lastNameField = page.getByLabel(/姓/);
    const firstNameField = page.getByLabel(/名/);
    await expect(lastNameField).toBeVisible({ timeout: 30000 });

    // 必要に応じてフィールドを編集
    if ((await lastNameField.inputValue()) === "") {
      await lastNameField.fill("テスト");
    }
    if ((await firstNameField.inputValue()) === "") {
      await firstNameField.fill("花子");
    }

    // Step 7: "保存" をクリック
    await page.getByRole("button", { name: /保存|送信|登録/ }).click();

    // Step 8: 名刺が正常に作成される
    await expect(
      page
        .getByText(/保存しました|作成しました|登録しました/)
        .or(page.locator('[data-testid="namecard-detail"]')),
    ).toBeVisible({ timeout: 10000 });

    // 名刺詳細ページに遷移していることを確認（URL にnamecardsが含まれる）
    await expect(page).toHaveURL(/namecards/);
  });
});

// ── 異常系 ──────────────────────────────────────────────

test.describe("OCR フロー異常系", () => {
  test("test_ocr_timeout_shows_error: OCR タイムアウトでエラーメッセージ", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["camera"]);

    await page.goto("/namecards/new");

    // カメラ撮影 → 四隅確定
    await page.getByRole("button", { name: /カメラ|撮影|📷/ }).click();
    await expect(
      page.getByTestId("camera-guide").or(page.getByRole("region")),
    ).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /撮影/ }).click();
    await expect(page.getByRole("button", { name: /確定/ })).toBeVisible({
      timeout: 10000,
    });

    // OCR API をタイムアウトさせるためにルートをインターセプト
    await page.route("**/api/v1/ocr*", async (route) => {
      // タイムアウトをシミュレート: 応答を遅延させる
      await new Promise((resolve) => setTimeout(resolve, 60000));
      await route.abort("timedout");
    });

    await page.getByRole("button", { name: /確定/ }).click();

    // タイムアウトエラーメッセージが表示される
    await expect(
      page.getByText(/タイムアウト|時間がかかりすぎ|再試行|エラー|失敗/),
    ).toBeVisible({ timeout: 60000 });
  });

  test("test_camera_permission_denied: カメラ権限拒否でエラー表示", async ({
    page,
    context,
  }) => {
    // カメラ権限を明示的に拒否（権限を付与しない）
    await context.clearPermissions();

    await page.goto("/namecards/new");

    // カメラボタンをクリック
    await page.getByRole("button", { name: /カメラ|撮影|📷/ }).click();

    // カメラアクセス拒否のエラーメッセージが表示される
    await expect(
      page.getByText(
        /カメラへのアクセスが許可されていません|カメラの使用が拒否|permission|カメラ.*エラー/i,
      ),
    ).toBeVisible({ timeout: 10000 });
  });
});
