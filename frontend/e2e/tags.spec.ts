import { expect, test } from "@playwright/test";

test.describe("Tags", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "test@example.com");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");
  });

  // ─── 正常系 ───────────────────────────────────────────────

  test("test_tag_list_display", async ({ page }) => {
    await page.goto("/tags");

    await expect(page.getByText("取引先")).toBeVisible();
    await expect(page.getByText("友人")).toBeVisible();
    await expect(page.getByText("ゴルフ仲間")).toBeVisible();
  });

  test("test_create_tag", async ({ page }) => {
    await page.goto("/tags");

    const nameInput = page.getByRole("textbox");
    await nameInput.fill("重要");

    await page.getByRole("button", { name: /追加/ }).click();

    await expect(page.getByText("重要")).toBeVisible();
  });

  test("test_rename_tag", async ({ page }) => {
    await page.goto("/tags");

    const tagText = page.getByText("取引先");
    await expect(tagText).toBeVisible();

    await tagText.dblclick();

    const editInput = page
      .getByRole("textbox", { name: /取引先/ })
      .or(page.locator('input[value="取引先"]'));
    await editInput.clear();
    await editInput.fill("重要取引先");
    await editInput.press("Enter");

    await expect(page.getByText("重要取引先")).toBeVisible();
    await expect(page.getByText("取引先").first()).not.toBeVisible();
  });

  test("test_delete_tag", async ({ page }) => {
    await page.goto("/tags");

    const tagElement = page.getByText("友人");
    await expect(tagElement).toBeVisible();

    const tagRow = tagElement
      .locator("xpath=ancestor::*[@data-testid]")
      .first();
    await tagRow.getByRole("button", { name: /削除/ }).click();

    await page.getByRole("button", { name: /削除する/ }).click();

    await expect(page.getByText("友人")).not.toBeVisible();
  });

  // ─── 異常系 ───────────────────────────────────────────────

  test("test_create_tag_duplicate_error", async ({ page }) => {
    await page.goto("/tags");

    const nameInput = page.getByRole("textbox");
    await nameInput.fill("取引先");

    await page.getByRole("button", { name: /追加/ }).click();

    await expect(page.getByText(/既に存在するタグです|重複/)).toBeVisible();
  });

  test("test_create_tag_empty_name", async ({ page }) => {
    await page.goto("/tags");

    await page.getByRole("button", { name: /追加/ }).click();

    await expect(page.getByText(/タグ名を入力してください|必須/)).toBeVisible();
  });
});
