import { expect, type Page, test } from "@playwright/test";

const TEST_USER = {
  email: `e2e-cards-${Date.now()}@example.com`,
  password: "TestPass123!",
};

async function registerAndLogin(page: Page) {
  await page.goto("/register");
  await page.getByLabel(/メールアドレス/).fill(TEST_USER.email);
  await page
    .getByLabel(/パスワード/)
    .first()
    .fill(TEST_USER.password);
  await page.getByRole("button", { name: /登録/ }).click();
  await page.waitForURL(/\/(login)?/);

  await page.goto("/login");
  await page.getByLabel(/メールアドレス/).fill(TEST_USER.email);
  await page.getByLabel(/パスワード/).fill(TEST_USER.password);
  await page.getByRole("button", { name: /ログイン/ }).click();
  await expect(page).toHaveURL("/");
}

async function createNamecard(
  page: Page,
  data: { lastName: string; firstName: string },
) {
  await page.goto("/namecards/new");
  await page.getByLabel(/姓/).fill(data.lastName);
  await page.getByLabel(/名/).fill(data.firstName);
  await page.getByRole("button", { name: /保存/ }).click();
  await page.waitForURL(/\/namecards\/\w+/);
}

test.describe("名刺 CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
  });

  // ─── 正常系 ─────────────────────────────────────────────

  test("test_create_namecard_minimal", async ({ page }) => {
    await page.goto("/namecards/new");
    await page.getByLabel(/姓/).fill("田中");
    await page.getByLabel(/名/).fill("太郎");
    await page.getByRole("button", { name: /保存/ }).click();

    await page.waitForURL(/\/namecards\/\w+/);
    await expect(page.getByText("田中 太郎")).toBeVisible();
  });

  test("test_create_namecard_full", async ({ page }) => {
    await page.goto("/namecards/new");

    await page.getByLabel(/姓/).fill("山田");
    await page.getByLabel(/名/).fill("花子");
    await page.getByLabel(/カナ/).first().fill("ヤマダ");
    await page.getByLabel(/カナ/).last().fill("ハナコ");
    await page.getByLabel(/会社名/).fill("株式会社テスト");
    await page.getByLabel(/部署/).fill("開発部");
    await page.getByLabel(/役職/).fill("課長");
    await page.getByLabel(/メモ/).fill("E2Eテスト用の名刺");

    const relSelect = page.getByRole("combobox", { name: /所属|関係/ });
    if (await relSelect.isVisible()) {
      await relSelect.click();
      await page.getByRole("option").first().click();
    }

    const tagSelect = page.getByRole("combobox", { name: /タグ/ });
    if (await tagSelect.isVisible()) {
      await tagSelect.click();
      await page.getByRole("option").first().click();
    }

    await page.getByRole("button", { name: /保存/ }).click();
    await page.waitForURL(/\/namecards\/\w+/);

    await expect(page.getByText("山田 花子")).toBeVisible();
    await expect(page.getByText("株式会社テスト")).toBeVisible();
    await expect(page.getByText("開発部")).toBeVisible();
    await expect(page.getByText("課長")).toBeVisible();
    await expect(page.getByText("E2Eテスト用の名刺")).toBeVisible();
  });

  test("test_create_namecard_with_contact_methods", async ({ page }) => {
    await page.goto("/namecards/new");
    await page.getByLabel(/姓/).fill("鈴木");
    await page.getByLabel(/名/).fill("一郎");

    // 1件目: email
    await page.getByRole("button", { name: /連絡先を追加/ }).click();
    const firstRow = page.locator("[data-testid='contact-method-row']").nth(0);
    await firstRow.getByRole("combobox", { name: /タイプ|種別/ }).click();
    await page.getByRole("option", { name: /email/i }).click();
    await firstRow.getByRole("textbox").fill("suzuki@example.com");

    // 2件目: mobile
    await page.getByRole("button", { name: /連絡先を追加/ }).click();
    const secondRow = page.locator("[data-testid='contact-method-row']").nth(1);
    await secondRow.getByRole("combobox", { name: /タイプ|種別/ }).click();
    await page.getByRole("option", { name: /mobile/i }).click();
    await secondRow.getByRole("textbox").fill("090-1111-2222");

    await page.getByRole("button", { name: /保存/ }).click();
    await page.waitForURL(/\/namecards\/\w+/);

    await expect(page.getByText("suzuki@example.com")).toBeVisible();
    await expect(page.getByText("090-1111-2222")).toBeVisible();
  });

  test("test_view_namecard_detail", async ({ page }) => {
    await createNamecard(page, { lastName: "佐藤", firstName: "次郎" });

    const currentUrl = page.url();
    await page.goto(currentUrl);

    await expect(page.getByText("佐藤 次郎")).toBeVisible();
  });

  test("test_edit_namecard_modal", async ({ page }) => {
    await createNamecard(page, { lastName: "田中", firstName: "太郎" });

    await page.getByRole("button", { name: /編集/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByLabel(/名/).clear();
    await page.getByLabel(/名/).fill("次郎");
    await page.getByRole("button", { name: /保存/ }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("田中 次郎")).toBeVisible();
  });

  test("test_delete_namecard", async ({ page }) => {
    await createNamecard(page, { lastName: "削除用", firstName: "テスト" });

    await page.getByRole("button", { name: /削除/ }).click();
    await page.getByRole("button", { name: /削除する/ }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByText("削除用 テスト")).toBeHidden();
  });

  test("test_namecard_list_pagination", async ({ page }) => {
    for (let i = 0; i < 25; i++) {
      await createNamecard(page, {
        lastName: "ページ",
        firstName: `テスト${String(i).padStart(2, "0")}`,
      });
    }

    await page.goto("/");

    const items = page.getByRole("listitem");
    await expect(items).toHaveCount(20);

    await page.getByRole("button", { name: /2/ }).click();

    const pageTwo = page.getByRole("listitem");
    await expect(pageTwo).toHaveCount(5);
  });

  test("test_namecard_list_shows_thumbnail", async ({ page }) => {
    await createNamecard(page, { lastName: "画像", firstName: "テスト" });

    await page.goto("/");

    const thumbnail = page
      .getByRole("img")
      .or(page.locator("[data-testid='namecard-placeholder-icon']"));
    await expect(thumbnail.first()).toBeVisible();
  });

  // ─── 異常系 ─────────────────────────────────────────────

  test("test_create_namecard_validation_error", async ({ page }) => {
    await page.goto("/namecards/new");
    await page.getByRole("button", { name: /保存/ }).click();

    await expect(page.getByText(/姓は必須/)).toBeVisible();
    await expect(page.getByText(/名は必須/)).toBeVisible();
  });

  test("test_edit_namecard_cancel", async ({ page }) => {
    await createNamecard(page, { lastName: "元の姓", firstName: "元の名" });

    await page.getByRole("button", { name: /編集/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByLabel(/名/).clear();
    await page.getByLabel(/名/).fill("変更後の名");
    await page.getByRole("button", { name: /キャンセル/ }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("元の姓 元の名")).toBeVisible();
  });
});
