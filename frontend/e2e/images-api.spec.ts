/**
 * 画像 API の E2E（OCR は OCR_PROVIDER=none で外部を呼ばない）。
 * 前提: 隔離 PostgreSQL、AUTH_SECRET、SECRET_KEY、IMAGE_DIR が設定されていること。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

const PASSWORD = "DummyPass123!";

async function signup(request: import("@playwright/test").APIRequestContext) {
  const email = `e2e-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const registered = await request.post("/api/v1/auth/register", {
    data: { email, password: PASSWORD },
  });
  expect(registered.status()).toBe(201);
  const login = await request.post("/api/v1/auth/login", {
    data: { email, password: PASSWORD },
  });
  expect(login.status()).toBe(200);
}

async function createNamecard(
  request: import("@playwright/test").APIRequestContext,
) {
  const created = await request.post("/api/v1/namecards", {
    data: { last_name: "画像", first_name: "太郎" },
  });
  expect(created.status()).toBe(201);
  return created.json();
}

async function dummyPng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 400,
      height: 260,
      channels: 3,
      background: { r: 120, g: 160, b: 200 },
    },
  })
    .png()
    .toBuffer();
}

const CORNERS = [
  { x: 0, y: 0 },
  { x: 399, y: 0 },
  { x: 399, y: 259 },
  { x: 0, y: 259 },
];

test.describe("画像 API", () => {
  test("未認証は画像取得 401", async ({ request }) => {
    const response = await request.get("/api/v1/images/1");
    expect(response.status()).toBe(401);
  });

  test("アップロード → 補正 → 保存 → 取得 → 差し替え → 削除", async ({
    request,
  }) => {
    await signup(request);
    const card = await createNamecard(request);

    const upload = await request.post("/api/v1/images/upload", {
      multipart: {
        file: {
          name: "dummy.png",
          mimeType: "image/png",
          buffer: await dummyPng(),
        },
      },
    });
    expect(upload.status()).toBe(202);
    const { upload_id: uploadId } = await upload.json();

    const processed = await request.post("/api/v1/images/process", {
      data: { upload_id: uploadId, corners: CORNERS },
    });
    expect(processed.status()).toBe(200);
    const result = await processed.json();
    expect(result.ocr_result).toMatchObject({ last_name: "", first_name: "" });
    expect(result.image_path.endsWith(".webp")).toBe(true);
    expect(result.thumbnail_path).toContain("thumbnails");

    const invalidCorners = await request.post("/api/v1/images/process", {
      data: { upload_id: "unknown", corners: CORNERS.slice(0, 3) },
    });
    expect(invalidCorners.status()).toBe(422);

    const saved = await request.post(`/api/v1/namecards/${card.id}/images`, {
      data: { image_path: result.image_path },
    });
    expect(saved.status()).toBe(201);
    const image = await saved.json();
    expect(image.position).toBe(0);

    const listed = await request.get(`/api/v1/images/namecard/${card.id}`);
    expect(listed.status()).toBe(200);
    expect((await listed.json()).images).toHaveLength(1);

    const full = await request.get(`/api/v1/images/${card.id}`);
    expect(full.status()).toBe(200);
    expect(full.headers()["content-type"]).toBe("image/webp");
    const fullMeta = await sharp(await full.body()).metadata();
    expect(fullMeta.width).toBe(910);
    expect(fullMeta.height).toBe(550);

    const byId = await request.get(
      `/api/v1/images/${card.id}?image_id=${image.id}`,
    );
    expect(byId.status()).toBe(200);

    const thumb = await request.get(`/api/v1/images/${card.id}/thumbnail`);
    expect(thumb.status()).toBe(200);
    const thumbMeta = await sharp(await thumb.body()).metadata();
    expect(thumbMeta.width).toBeLessThanOrEqual(300);
    expect(thumbMeta.height).toBeLessThanOrEqual(188);

    // 追加画像（OCR なし）→ 差し替え → 削除
    const upload2 = await request.post("/api/v1/images/upload", {
      multipart: {
        file: {
          name: "dummy2.png",
          mimeType: "image/png",
          buffer: await dummyPng(),
        },
      },
    });
    const { upload_id: uploadId2 } = await upload2.json();
    const additional = await request.post("/api/v1/images/process-additional", {
      data: { upload_id: uploadId2, corners: CORNERS },
    });
    expect(additional.status()).toBe(200);
    const additionalBody = await additional.json();

    const replaced = await request.put(
      `/api/v1/namecards/${card.id}/images/${image.id}`,
      { data: { image_path: additionalBody.image_path } },
    );
    expect(replaced.status()).toBe(200);
    expect((await replaced.json()).image_path).toBe(additionalBody.image_path);

    const removed = await request.delete(
      `/api/v1/namecards/${card.id}/images/${image.id}`,
    );
    expect(removed.status()).toBe(204);
    const after = await request.get(`/api/v1/images/namecard/${card.id}`);
    expect((await after.json()).images).toEqual([]);
  });

  test("既存 image_path の互換解決（uploads/images 相対・サムネイル）", async ({
    request,
  }) => {
    await signup(request);
    const card = await createNamecard(request);
    const imageDir = process.env.IMAGE_DIR;
    expect(imageDir).toBeTruthy();
    mkdirSync(join(imageDir as string, "thumbnails"), { recursive: true });
    const filename = `legacy-${Date.now()}.webp`;
    const full = await sharp({
      create: {
        width: 910,
        height: 550,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .webp()
      .toBuffer();
    const thumb = await sharp(full)
      .resize(300, 188, { fit: "inside" })
      .webp()
      .toBuffer();
    writeFileSync(join(imageDir as string, filename), full);
    writeFileSync(join(imageDir as string, "thumbnails", filename), thumb);

    const saved = await request.post(`/api/v1/namecards/${card.id}/images`, {
      data: { image_path: `uploads/images/${filename}` },
    });
    expect(saved.status()).toBe(201);

    const served = await request.get(`/api/v1/images/${card.id}`);
    expect(served.status()).toBe(200);
    expect((await served.body()).equals(full)).toBe(true);

    const servedThumb = await request.get(
      `/api/v1/images/${card.id}/thumbnail`,
    );
    expect(servedThumb.status()).toBe(200);
    expect((await servedThumb.body()).equals(thumb)).toBe(true);
  });
});
