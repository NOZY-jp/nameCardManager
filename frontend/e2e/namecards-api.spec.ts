/**
 * 名刺 CRUD・検索 API の E2E。
 * 前提: 隔離 PostgreSQL（DATABASE_URL）、AUTH_SECRET、SECRET_KEY が設定されていること。
 */
import { expect, test } from "@playwright/test";

const PASSWORD = "DummyPass123!";

function uniqueEmail(): string {
  return `e2e-nc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function signup(
  request: import("@playwright/test").APIRequestContext,
): Promise<{ email: string }> {
  const email = uniqueEmail();
  const registered = await request.post("/api/v1/auth/register", {
    data: { email, password: PASSWORD },
  });
  expect(registered.status()).toBe(201);
  const login = await request.post("/api/v1/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(login.status()).toBe(200);
  return { email };
}

test.describe("名刺 API", () => {
  test("未認証は 401", async ({ request }) => {
    for (const path of ["/api/v1/namecards", "/api/v1/search?q=x"]) {
      const response = await request.get(path);
      expect(response.status()).toBe(401);
    }
  });

  test("検索は大小無視・かなカナ相互一致", async ({ request }) => {
    await signup(request);
    const ascii = await request.post("/api/v1/namecards", {
      data: { last_name: "Tanaka", first_name: "Jiro" },
    });
    expect(ascii.status()).toBe(201);
    const asciiCard = await ascii.json();

    const kana = await request.post("/api/v1/namecards", {
      data: { last_name: "たなか", last_name_kana: "タナカ" },
    });
    expect(kana.status()).toBe(201);
    const kanaCard = await kana.json();

    const asciiSearch = await request.get("/api/v1/search?q=tanaka");
    expect(asciiSearch.status()).toBe(200);
    const asciiHits = await asciiSearch.json();
    expect(asciiHits.items.map((item: { id: number }) => item.id)).toContain(
      asciiCard.id,
    );

    for (const query of ["タナカ", "たなか"]) {
      const response = await request.get(
        `/api/v1/search?q=${encodeURIComponent(query)}`,
      );
      expect(response.status()).toBe(200);
      const hits = await response.json();
      expect(hits.items.map((item: { id: number }) => item.id)).toContain(
        kanaCard.id,
      );
    }
  });

  test("登録 → 一覧 → 詳細 → 編集 → 検索 → 削除", async ({ request }) => {
    await signup(request);
    const marker = `検索${Date.now()}`;

    const created = await request.post("/api/v1/namecards", {
      data: {
        last_name: marker,
        first_name: "太郎",
        company_name: "ダミー商事",
        contact_methods: [
          { type: "email", value: `${marker}@example.test`, is_primary: true },
        ],
        image_paths: ["dummy/front.webp"],
      },
    });
    expect(created.status()).toBe(201);
    const card = await created.json();
    expect(card).toMatchObject({
      last_name: marker,
      first_name: "太郎",
      company_name: "ダミー商事",
    });
    expect(card.images).toHaveLength(1);
    expect(card.contact_methods).toHaveLength(1);

    const detail = await request.get(`/api/v1/namecards/${card.id}`);
    expect(detail.status()).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({ id: card.id });

    const patched = await request.patch(`/api/v1/namecards/${card.id}`, {
      data: {
        memo: "更新メモ",
        contact_methods: [{ type: "tel", value: "03-0000-0000" }],
      },
    });
    expect(patched.status()).toBe(200);
    const updated = await patched.json();
    expect(updated.memo).toBe("更新メモ");
    expect(updated.contact_methods).toEqual([
      {
        id: expect.any(Number),
        type: "tel",
        value: "03-0000-0000",
        is_primary: false,
      },
    ]);

    for (const suffix of ["A", "B"]) {
      const extra = await request.post("/api/v1/namecards", {
        data: { last_name: `${marker}-${suffix}` },
      });
      expect(extra.status()).toBe(201);
    }

    const list = await request.get("/api/v1/namecards?per_page=2&page=2");
    expect(list.status()).toBe(200);
    const page2 = await list.json();
    expect(page2.page).toBe(2);
    expect(page2.per_page).toBe(2);
    expect(page2.total).toBeGreaterThanOrEqual(3);
    expect(page2.total_pages).toBe(Math.ceil(page2.total / 2));
    expect(page2.items.length).toBeLessThanOrEqual(2);

    const search = await request.get(
      `/api/v1/search?q=${encodeURIComponent(marker)}`,
    );
    expect(search.status()).toBe(200);
    const found = await search.json();
    expect(found.items.map((item: { id: number }) => item.id)).toContain(
      card.id,
    );
    const hit = found.items.find((item: { id: number }) => item.id === card.id);
    expect(hit.image_path).toBe("dummy/front.webp");

    const byContact = await request.get(
      `/api/v1/search?q=${encodeURIComponent(`${marker}@example`)}`,
    );
    expect(byContact.status()).toBe(200);
    const contactHits = await byContact.json();
    expect(contactHits.items.map((item: { id: number }) => item.id)).toContain(
      card.id,
    );

    const missing = await request.get("/api/v1/namecards/999999");
    expect(missing.status()).toBe(404);
    await expect(missing.json()).resolves.toEqual({
      detail: "Namecard not found",
    });

    const invalid = await request.post("/api/v1/namecards", { data: {} });
    expect(invalid.status()).toBe(422);
    const invalidBody = await invalid.json();
    expect(Array.isArray(invalidBody.detail)).toBe(true);
    expect(invalidBody.detail[0]).toMatchObject({
      type: expect.any(String),
      loc: expect.any(Array),
      msg: expect.any(String),
    });

    const removed = await request.delete(`/api/v1/namecards/${card.id}`);
    expect(removed.status()).toBe(204);
    const afterDelete = await request.get(`/api/v1/namecards/${card.id}`);
    expect(afterDelete.status()).toBe(404);
  });
});
