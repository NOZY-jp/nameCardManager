import { test, expect } from "@playwright/test";

test.describe("Relationships", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "test@example.com");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/");
  });

  // ─── 正常系 ───────────────────────────────────────────────

  test("test_relationship_tree_display", async ({ page }) => {
    await page.goto("/relationships");

    await expect(page.getByText("建築士会")).toBeVisible();
    await expect(page.getByText("桑名支部")).toBeVisible();
    await expect(page.getByText("青年会長")).toBeVisible();
  });

  test("test_add_root_relationship", async ({ page }) => {
    await page.goto("/relationships");

    await page.getByRole("button", { name: /追加/ }).click();

    const nameInput = page.getByRole("textbox");
    await nameInput.fill("Jasca");

    await page.getByRole("button", { name: /確定|保存|追加/ }).last().click();

    await expect(page.getByText("Jasca")).toBeVisible();
  });

  test("test_add_child_relationship", async ({ page }) => {
    await page.goto("/relationships");

    const parentNode = page.getByText("建築士会");
    await expect(parentNode).toBeVisible();

    const parentRow = parentNode.locator("xpath=ancestor::*[@data-testid]").first();
    await parentRow.getByRole("button", { name: /子を追加/ }).click();

    const nameInput = page.getByRole("textbox");
    await nameInput.fill("桑名支部");

    await page.getByRole("button", { name: /確定|保存|追加/ }).last().click();

    await expect(page.getByText("桑名支部")).toBeVisible();
  });

  test("test_rename_relationship", async ({ page }) => {
    await page.goto("/relationships");

    const nodeText = page.getByText("桑名支部");
    await expect(nodeText).toBeVisible();

    await nodeText.dblclick();

    const editInput = page.getByRole("textbox", { name: /桑名支部/ }).or(
      page.locator('input[value="桑名支部"]'),
    );
    await editInput.clear();
    await editInput.fill("四日市支部");
    await editInput.press("Enter");

    await expect(page.getByText("四日市支部")).toBeVisible();
    await expect(page.getByText("桑名支部")).not.toBeVisible();
  });

  test("test_delete_leaf_relationship", async ({ page }) => {
    await page.goto("/relationships");

    const leafNode = page.getByText("青年会長");
    await expect(leafNode).toBeVisible();

    const leafRow = leafNode.locator("xpath=ancestor::*[@data-testid]").first();
    await leafRow.getByRole("button", { name: /削除/ }).click();

    await page.getByRole("button", { name: /削除する/ }).click();

    await expect(page.getByText("青年会長")).not.toBeVisible();
    await expect(page.getByText("桑名支部")).toBeVisible();
  });

  // ─── 異常系 ───────────────────────────────────────────────

  test("test_delete_parent_relationship_error", async ({ page }) => {
    await page.goto("/relationships");

    const parentNode = page.getByText("建築士会");
    await expect(parentNode).toBeVisible();

    const parentRow = parentNode.locator("xpath=ancestor::*[@data-testid]").first();

    const deleteButton = parentRow.getByRole("button", { name: /削除/ });
    const isDisabled = await deleteButton.isDisabled().catch(() => true);

    if (isDisabled) {
      await expect(deleteButton).toBeDisabled();
    } else {
      await deleteButton.click();
      await expect(
        page.getByText(/子ノードがあるため削除できません/),
      ).toBeVisible();
    }
  });

  test("test_add_relationship_empty_name", async ({ page }) => {
    await page.goto("/relationships");

    await page.getByRole("button", { name: /追加/ }).click();

    await page.getByRole("button", { name: /確定|保存|追加/ }).last().click();

    await expect(
      page.getByText(/名前を入力してください|必須/),
    ).toBeVisible();
  });
});
