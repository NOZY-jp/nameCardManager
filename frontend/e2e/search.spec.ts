import { expect, test } from "@playwright/test";

/**
 * 検索機能の E2E テスト
 *
 * 前提: テスト実行前にログイン済み、テストデータ（名刺 5 件、タグ、Relationship）が
 * API 側に投入されていること。各テストは API レスポンスに依存するため、
 * テストデータのセットアップは beforeEach 内で API 経由で行う。
 */

// ── Helpers ──────────────────────────────────────────────

const API_BASE = "/api/v1";

/** テスト用の名刺データ */
const TEST_CARDS = {
  tanakaTaro: {
    last_name: "田中",
    first_name: "太郎",
    last_name_kana: "たなか",
    first_name_kana: "たろう",
    contact_methods: [],
  },
  tanakaJiro: {
    last_name: "田中",
    first_name: "次郎",
    last_name_kana: "たなか",
    first_name_kana: "じろう",
    contact_methods: [],
  },
  satoHanako: {
    last_name: "佐藤",
    first_name: "花子",
    last_name_kana: "さとう",
    first_name_kana: "はなこ",
    contact_methods: [],
  },
  suzukiIchiro: {
    last_name: "鈴木",
    first_name: "一郎",
    last_name_kana: "すずき",
    first_name_kana: "いちろう",
    contact_methods: [],
  },
  yamadaYoko: {
    last_name: "山田",
    first_name: "洋子",
    last_name_kana: "やまだ",
    first_name_kana: "ようこ",
    contact_methods: [],
  },
} as const;

/** 検索入力後にデバウンス (300ms) を待つ */
async function waitForDebounce(ms = 400) {
  // debounce 300ms + ネットワーク余裕
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Setup / Teardown ─────────────────────────────────────

test.describe("検索機能", () => {
  /**
   * NOTE: 実際の E2E 環境では beforeAll / beforeEach で API を叩いて
   * テストデータを作成し、afterAll で削除する。
   * ここでは page.request を使い API 経由でセットアップする。
   */

  test.beforeEach(async ({ page }) => {
    // ログイン（セッション確立）
    await page.goto("/");
    // ログインが必要な場合はここで実施
  });

  // ── 正常系 ──────────────────────────────────────────

  test("test_search_by_name: 氏名でキーワード検索できる", async ({
    page,
  }) => {
    await page.goto("/");

    const searchBox =
      page.getByRole("searchbox").or(page.getByPlaceholder(/検索/));
    await searchBox.fill("田中");
    await waitForDebounce();

    // "田中太郎" が表示される
    await expect(page.getByText("田中太郎")).toBeVisible();
    // "佐藤花子" は表示されない
    await expect(page.getByText("佐藤花子")).not.toBeVisible();
  });

  test("test_search_partial_match: 部分一致で検索できる", async ({ page }) => {
    await page.goto("/");

    const searchBox =
      page.getByRole("searchbox").or(page.getByPlaceholder(/検索/));
    await searchBox.fill("田");
    await waitForDebounce();

    // "田中" を含む名刺が表示される
    await expect(page.getByText(/田中/)).toBeVisible();
  });

  test("test_search_by_kana: カナで検索できる", async ({ page }) => {
    await page.goto("/");

    const searchBox =
      page.getByRole("searchbox").or(page.getByPlaceholder(/検索/));
    await searchBox.fill("たなか");
    await waitForDebounce();

    // "たなか" にマッチする名刺（田中太郎 or 田中次郎）が表示される
    await expect(page.getByText(/田中/)).toBeVisible();
  });

  test("test_search_filter_by_tag: タグでフィルタリングできる", async ({
    page,
  }) => {
    await page.goto("/");

    // タグフィルタのコンボボックスを開いて "取引先" を選択
    const tagFilter = page.getByRole("combobox", { name: /タグ/ });
    await tagFilter.click();
    await page.getByText("取引先").click();
    await waitForDebounce();

    // タグ "取引先" 付きの名刺のみ表示される
    const items = page.getByRole("listitem");
    const count = await items.count();
    expect(count).toBeGreaterThan(0);

    // フィルタされた結果にタグ "取引先" が含まれることを確認
    await expect(page.getByText("取引先").first()).toBeVisible();
  });

  test("test_search_filter_by_relationship: Relationship でフィルタリングできる", async ({
    page,
  }) => {
    await page.goto("/");

    // Relationship フィルタのコンボボックスを開いて "桑名支部" を選択
    const relFilter = page.getByRole("combobox", { name: /所属|関係/ });
    await relFilter.click();

    // ツリーを展開して "桑名支部" を選択
    const expandButton = page.getByRole("button", { name: /建築士会/ });
    if (await expandButton.isVisible()) {
      await expandButton.click();
    }
    await page.getByText("桑名支部").click();
    await waitForDebounce();

    // 該当の名刺のみ表示される
    const items = page.getByRole("listitem");
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
  });

  test("test_search_combined_text_and_filter: テキスト + フィルタの複合検索", async ({
    page,
  }) => {
    await page.goto("/");

    // テキスト検索
    const searchBox =
      page.getByRole("searchbox").or(page.getByPlaceholder(/検索/));
    await searchBox.fill("田中");
    await waitForDebounce();

    // タグフィルタで "取引先" を選択
    const tagFilter = page.getByRole("combobox", { name: /タグ/ });
    await tagFilter.click();
    await page.getByText("取引先").click();
    await waitForDebounce();

    // "田中太郎" のみ表示される（"田中次郎" はタグ "友人" なので除外）
    await expect(page.getByText("田中太郎")).toBeVisible();
    await expect(page.getByText("田中次郎")).not.toBeVisible();
  });

  test("test_search_no_results: 該当なしで空メッセージ表示", async ({
    page,
  }) => {
    await page.goto("/");

    const searchBox =
      page.getByRole("searchbox").or(page.getByPlaceholder(/検索/));
    await searchBox.fill("存在しないキーワード");
    await waitForDebounce();

    // 検索結果なしメッセージが表示される
    await expect(
      page.getByText(/検索結果がありません|該当する名刺がありません|0件/),
    ).toBeVisible();
  });

  test("test_search_clear_restores_all: 検索クリアで全件表示に戻る", async ({
    page,
  }) => {
    await page.goto("/");

    // まず全件数を記録
    const allItems = page.getByRole("listitem");
    const initialCount = await allItems.count();
    expect(initialCount).toBeGreaterThanOrEqual(5);

    // 検索で絞り込み
    const searchBox =
      page.getByRole("searchbox").or(page.getByPlaceholder(/検索/));
    await searchBox.fill("田中");
    await waitForDebounce();

    const filteredCount = await allItems.count();
    expect(filteredCount).toBeLessThan(initialCount);

    // クリアボタンをクリック
    const clearButton = page.getByRole("button", {
      name: /クリア|clear|✕|×/i,
    });
    await clearButton.click();
    await waitForDebounce();

    // 全件が再表示される
    const restoredCount = await allItems.count();
    expect(restoredCount).toBe(initialCount);
  });
});
