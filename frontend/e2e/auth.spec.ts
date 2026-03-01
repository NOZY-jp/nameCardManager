import { expect, test } from "@playwright/test";

const TEST_USER = {
  email: `e2e-auth-${Date.now()}@example.com`,
  password: "TestPass123!",
};

const EXISTING_USER = {
  email: "existing-e2e@example.com",
  password: "TestPass123!",
};

test.describe("認証フロー", () => {
  // ─── 正常系 ─────────────────────────────────────────────

  test("test_register_and_login_flow", async ({ page }) => {
    // 1. 新規登録
    await page.goto("/register");
    await page.getByLabel(/メールアドレス/).fill(TEST_USER.email);
    await page
      .getByLabel(/パスワード/)
      .first()
      .fill(TEST_USER.password);
    await page.getByRole("button", { name: /登録/ }).click();

    // 登録成功メッセージが表示される
    await expect(
      page.getByText(/登録.*(成功|完了)|アカウント.*作成/),
    ).toBeVisible();

    // 2. ログイン
    await page.goto("/login");
    await page.getByLabel(/メールアドレス/).fill(TEST_USER.email);
    await page.getByLabel(/パスワード/).fill(TEST_USER.password);
    await page.getByRole("button", { name: /ログイン/ }).click();

    // 3. 名刺一覧ページにリダイレクト
    await expect(page).toHaveURL("/");
  });

  test("test_login_success", async ({ page }) => {
    // Setup: 登録済みユーザーを作成
    await page.goto("/register");
    await page.getByLabel(/メールアドレス/).fill(EXISTING_USER.email);
    await page
      .getByLabel(/パスワード/)
      .first()
      .fill(EXISTING_USER.password);
    await page.getByRole("button", { name: /登録/ }).click();
    await page.waitForURL(/\/(login)?/);

    // ログイン
    await page.goto("/login");
    await page.getByLabel(/メールアドレス/).fill(EXISTING_USER.email);
    await page.getByLabel(/パスワード/).fill(EXISTING_USER.password);
    await page.getByRole("button", { name: /ログイン/ }).click();

    // 名刺一覧ページにリダイレクト
    await expect(page).toHaveURL("/");
  });

  test("test_logout_flow", async ({ page }) => {
    // Setup: ログイン
    await page.goto("/register");
    const logoutUser = {
      email: `e2e-logout-${Date.now()}@example.com`,
      password: "TestPass123!",
    };
    await page.getByLabel(/メールアドレス/).fill(logoutUser.email);
    await page
      .getByLabel(/パスワード/)
      .first()
      .fill(logoutUser.password);
    await page.getByRole("button", { name: /登録/ }).click();
    await page.waitForURL(/\/(login)?/);

    await page.goto("/login");
    await page.getByLabel(/メールアドレス/).fill(logoutUser.email);
    await page.getByLabel(/パスワード/).fill(logoutUser.password);
    await page.getByRole("button", { name: /ログイン/ }).click();
    await expect(page).toHaveURL("/");

    // 1. ログアウト
    await page.getByRole("button", { name: /ログアウト/ }).click();

    // 2. /login にリダイレクト
    await expect(page).toHaveURL(/\/login/);

    // 3. 保護されたページにアクセスできない
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  // ─── 異常系 ─────────────────────────────────────────────

  test("test_login_wrong_password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/メールアドレス/).fill(EXISTING_USER.email);
    await page.getByLabel(/パスワード/).fill("WrongPassword999!");
    await page.getByRole("button", { name: /ログイン/ }).click();

    // エラーメッセージが表示される
    await expect(
      page.getByText(/パスワード.*間違|認証.*失敗|ログイン.*失敗|Invalid/i),
    ).toBeVisible();
    // ログインページに留まる
    await expect(page).toHaveURL(/\/login/);
  });

  test("test_login_nonexistent_user", async ({ page }) => {
    await page.goto("/login");
    await page
      .getByLabel(/メールアドレス/)
      .fill("nonexistent-user@example.com");
    await page.getByLabel(/パスワード/).fill("AnyPassword123!");
    await page.getByRole("button", { name: /ログイン/ }).click();

    // エラーメッセージが表示される
    await expect(
      page.getByText(/ユーザー.*存在しない|認証.*失敗|ログイン.*失敗|Invalid/i),
    ).toBeVisible();
  });

  test("test_register_duplicate_email", async ({ page }) => {
    // Setup: 先にユーザーを登録
    const dupUser = {
      email: `e2e-dup-${Date.now()}@example.com`,
      password: "TestPass123!",
    };
    await page.goto("/register");
    await page.getByLabel(/メールアドレス/).fill(dupUser.email);
    await page
      .getByLabel(/パスワード/)
      .first()
      .fill(dupUser.password);
    await page.getByRole("button", { name: /登録/ }).click();
    await page.waitForURL(/\/(login)?/);

    // 同じメールで再登録
    await page.goto("/register");
    await page.getByLabel(/メールアドレス/).fill(dupUser.email);
    await page
      .getByLabel(/パスワード/)
      .first()
      .fill(dupUser.password);
    await page.getByRole("button", { name: /登録/ }).click();

    // エラーメッセージ
    await expect(
      page.getByText(/既に.*登録|メール.*使用|already.*registered/i),
    ).toBeVisible();
  });

  test("test_register_invalid_email", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel(/メールアドレス/).fill("not-an-email");
    await page
      .getByLabel(/パスワード/)
      .first()
      .fill("TestPass123!");
    await page.getByRole("button", { name: /登録/ }).click();

    // バリデーションエラー
    await expect(
      page.getByText(/メール.*正しい|有効.*メール|メール.*形式/i),
    ).toBeVisible();
  });

  test("test_protected_page_redirect", async ({ page }) => {
    // ログアウト状態で保護されたページにアクセス
    await page.goto("/");

    // /login にリダイレクトされる
    await expect(page).toHaveURL(/\/login/);
  });
});
