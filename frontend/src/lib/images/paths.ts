/**
 * image_path の互換解決（読み取り専用）。
 *
 * 既存 FastAPI は `IMAGE_DIR`（既定 `./uploads/images`）配下の絶対/相対パスを
 * `name_card_images.image_path` に保存してきた。フロント由来の `/uploads/...` 表記も
 * あり得るため、候補を順に試して実在するファイルだけを返す。
 */
import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";

function imageDir(): string {
  return process.env.IMAGE_DIR ?? join(process.cwd(), "uploads", "images");
}

function candidates(imagePath: string): string[] {
  const cleaned = imagePath.replace(/\\/g, "/");
  const name = basename(cleaned);
  const withoutUploads = cleaned.replace(/^\/?uploads\//, "");
  const list = [
    imagePath,
    join(process.cwd(), cleaned),
    join(imageDir(), name),
    join(imageDir(), withoutUploads),
    join(process.cwd(), "uploads", withoutUploads),
  ];
  if (!/\.[a-z0-9]+$/i.test(name)) {
    list.push(...list.map((candidate) => `${candidate}.webp`));
  }
  return Array.from(new Set(list));
}

/** 実在する画像ファイルの絶対パスを返す（無ければ null）。 */
export function resolveImageFile(
  imagePath: string | null | undefined,
): string | null {
  if (!imagePath) return null;
  for (const candidate of candidates(imagePath)) {
    if (isAbsolute(candidate) && existsSync(candidate)) return candidate;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** サムネイル（同ディレクトリの thumbnails/）の実在パス。 */
export function resolveThumbnailFile(
  imagePath: string | null | undefined,
): string | null {
  const full = resolveImageFile(imagePath);
  if (!full) return null;
  const thumb = join(dirname(full), "thumbnails", basename(full));
  return existsSync(thumb) ? thumb : null;
}

/** 保存時に DB へ入れるパス（FastAPI の str(full_path) と同じ表記）。 */
export function storedImagePath(filename: string): string {
  return join(imageDir(), filename);
}

export function thumbnailsDir(): string {
  return join(imageDir(), "thumbnails");
}
