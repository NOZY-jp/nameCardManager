// @vitest-environment node
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { correctAndSave } from "@/lib/images/process";

const originalDir = process.env.IMAGE_DIR;
afterEach(() => {
  if (originalDir === undefined) delete process.env.IMAGE_DIR;
  else process.env.IMAGE_DIR = originalDir;
});

async function dummyPng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 400,
      height: 260,
      channels: 3,
      background: { r: 200, g: 180, b: 160 },
    },
  })
    .png()
    .toBuffer();
}

describe("perspective correction", () => {
  it("四隅補正して 910x550 の WebP とサムネイルを保存する", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nc-p4-"));
    process.env.IMAGE_DIR = dir;
    const result = await correctAndSave(await dummyPng(), [
      { x: 0, y: 0 },
      { x: 399, y: 0 },
      { x: 399, y: 259 },
      { x: 0, y: 259 },
    ]);
    expect(result.imagePath.startsWith(dir)).toBe(true);
    const full = await sharp(readFileSync(result.imagePath)).metadata();
    expect(full.format).toBe("webp");
    expect(full.width).toBe(910);
    expect(full.height).toBe(550);
    const thumb = await sharp(readFileSync(result.thumbnailPath)).metadata();
    expect(thumb.width).toBeLessThanOrEqual(300);
    expect(thumb.height).toBeLessThanOrEqual(188);
  });

  it("四隅が4点でない場合は拒否する", async () => {
    process.env.IMAGE_DIR = mkdtempSync(join(tmpdir(), "nc-p4-"));
    await expect(
      correctAndSave(await dummyPng(), [{ x: 0, y: 0 }]),
    ).rejects.toThrow();
  });
});
