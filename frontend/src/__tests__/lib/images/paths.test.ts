// @vitest-environment node
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isStorableImagePath,
  resolveImageFile,
  resolveThumbnailFile,
  storedImagePath,
} from "@/lib/images/paths";

const originalDir = process.env.IMAGE_DIR;

afterEach(() => {
  if (originalDir === undefined) delete process.env.IMAGE_DIR;
  else process.env.IMAGE_DIR = originalDir;
});

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "nc-images-"));
  process.env.IMAGE_DIR = dir;
  mkdirSync(join(dir, "thumbnails"), { recursive: true });
  writeFileSync(join(dir, "legacy.webp"), "dummy");
  writeFileSync(join(dir, "thumbnails", "legacy.webp"), "thumb");
  return dir;
}

describe("image path compatibility", () => {
  it("既存の絶対・相対・/uploads 表記を解決する", () => {
    const dir = setup();
    expect(resolveImageFile(join(dir, "legacy.webp"))).toBe(
      join(dir, "legacy.webp"),
    );
    expect(resolveImageFile("uploads/images/legacy.webp")).toBe(
      join(dir, "legacy.webp"),
    );
    expect(resolveImageFile("/uploads/legacy.webp")).toBe(
      join(dir, "legacy.webp"),
    );
    expect(resolveImageFile("legacy.webp")).toBe(join(dir, "legacy.webp"));
    expect(resolveImageFile("legacy")).toBe(join(dir, "legacy.webp"));
  });

  it("存在しないパスは null、サムネイルも解決する", () => {
    setup();
    expect(resolveImageFile("missing.webp")).toBeNull();
    expect(resolveImageFile(null)).toBeNull();
    expect(resolveThumbnailFile("uploads/images/legacy.webp")).toMatch(
      /thumbnails/,
    );
    expect(resolveThumbnailFile("missing.webp")).toBeNull();
  });

  it("IMAGE_DIR 外の絶対パス・traversal・外部シンボリックリンクは拒否する", () => {
    const dir = setup();
    const outsideDir = mkdtempSync(join(tmpdir(), "nc-outside-"));
    const outsideFile = join(outsideDir, "secret.webp");
    writeFileSync(outsideFile, "secret");

    expect(resolveImageFile(outsideFile)).toBeNull();
    expect(resolveImageFile("/etc/passwd")).toBeNull();
    expect(resolveImageFile("../../frontend/package.json")).toBeNull();
    expect(resolveImageFile("..%2F..%2Ffrontend/package.json")).toBeNull();

    try {
      symlinkSync(outsideFile, join(dir, "escape.webp"), "file");
      expect(resolveImageFile("escape.webp")).toBeNull();
      expect(resolveImageFile(join(dir, "escape.webp"))).toBeNull();
    } catch {
      // Windows でシンボリックリンク作成権限がない場合はスキップ
    }
  });

  it("保存可否は IMAGE_DIR 配下の実在ファイルだけ許可する", () => {
    const dir = setup();
    const outsideDir = mkdtempSync(join(tmpdir(), "nc-outside-"));
    const outsideFile = join(outsideDir, "secret.webp");
    writeFileSync(outsideFile, "secret");
    expect(isStorableImagePath(join(dir, "legacy.webp"))).toBe(true);
    expect(isStorableImagePath("uploads/images/legacy.webp")).toBe(true);
    expect(isStorableImagePath(outsideFile)).toBe(false);
    expect(isStorableImagePath("/etc/passwd")).toBe(false);
    expect(isStorableImagePath("../../frontend/package.json")).toBe(false);
    expect(isStorableImagePath("missing.webp")).toBe(false);
  });

  it("保存パスは IMAGE_DIR 配下になる", () => {
    const dir = setup();
    expect(storedImagePath("x.webp")).toBe(join(dir, "x.webp"));
  });
});
