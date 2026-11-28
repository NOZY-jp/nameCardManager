/**
 * image_path の互換解決（読み取り専用）と保存時検証。
 *
 * セキュリティ: 返してよいのは IMAGE_DIR の realpath 配下にある実在ファイルだけ。
 * 絶対パスや `/uploads/...` は IMAGE_DIR 基準へ写像し、`..`・シンボリックリンク脱出・
 * 外部絶対パスは 404（null）にする。
 */
import { existsSync, realpathSync } from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

export function imageDir(): string {
  return resolve(
    process.env.IMAGE_DIR ?? join(process.cwd(), "uploads", "images"),
  );
}

function realDir(): string | null {
  try {
    return realpathSync(imageDir());
  } catch {
    return null;
  }
}

function isInside(dir: string, target: string): boolean {
  const rel = relative(dir, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function realFile(candidate: string): string | null {
  try {
    if (!existsSync(candidate)) return null;
    const real = realpathSync(candidate);
    const dir = realDir();
    if (!dir) return null;
    return isInside(dir, real) ? real : null;
  } catch {
    return null;
  }
}

/** 入力パスから IMAGE_DIR 基準の候補を作る（`..` と NUL は即拒否）。 */
function candidates(imagePath: string): string[] {
  if (imagePath.includes("\0") || imagePath.includes("..")) return [];
  const dir = imageDir();
  const cleaned = imagePath.split(String.fromCharCode(92)).join("/");
  const name = basename(cleaned);
  const withoutUploads = cleaned.replace(/^\/?uploads\//, "");
  const uploadsIndex = cleaned.indexOf("/uploads/");
  const list: string[] = [];

  if (isAbsolute(cleaned)) {
    // IMAGE_DIR 配下の絶対パスはそのまま。外部絶対は basename だけ IMAGE_DIR に写像する。
    list.push(cleaned);
    list.push(join(dir, name));
    if (uploadsIndex >= 0) {
      list.push(join(dir, cleaned.slice(uploadsIndex + "/uploads/".length)));
    }
  } else {
    list.push(join(dir, cleaned));
    list.push(join(dir, withoutUploads));
    list.push(join(dir, name));
  }
  if (!/\.[a-z0-9]+$/i.test(name)) {
    list.push(...list.map((candidate) => `${candidate}.webp`));
  }
  return Array.from(new Set(list));
}

/** 実在し、IMAGE_DIR 配下に収まる画像ファイルの絶対パス（無ければ null）。 */
export function resolveImageFile(
  imagePath: string | null | undefined,
): string | null {
  if (!imagePath) return null;
  for (const candidate of candidates(imagePath)) {
    const real = realFile(candidate);
    if (real) return real;
  }
  return null;
}

/** サムネイル（同ディレクトリの thumbnails/）の実在パス。 */
export function resolveThumbnailFile(
  imagePath: string | null | undefined,
): string | null {
  const full = resolveImageFile(imagePath);
  if (!full) return null;
  return realFile(join(dirname(full), "thumbnails", basename(full)));
}

/**
 * 保存してよい image_path か（書き込み側の検証）。
 *
 * 自前で生成した形式（IMAGE_DIR 配下の絶対/相対、または uploads/ 始まり）で、
 * 解決結果が IMAGE_DIR 配下に実在するものだけを許可する。外部絶対パスは拒否。
 */
export function isStorableImagePath(imagePath: string): boolean {
  if (!imagePath || imagePath.includes("\0") || imagePath.includes(".."))
    return false;
  if (!/\.(webp|jpe?g|png)$/i.test(imagePath)) return false;
  const cleaned = imagePath.split(String.fromCharCode(92)).join("/");
  if (isAbsolute(cleaned)) {
    const dir = realDir();
    if (!dir) return false;
    const direct = realFile(cleaned);
    if (direct) return true;
    // サーバー絶対パス（/app/uploads/...）の互換: /uploads/ 以降を IMAGE_DIR に写像
    return cleaned.includes("/uploads/") && resolveImageFile(cleaned) !== null;
  }
  if (/^(uploads\/|\/?uploads\/|images\/)/.test(cleaned)) {
    return resolveImageFile(cleaned) !== null;
  }
  return false;
}

/** 保存時に DB へ入れるパス（FastAPI の str(full_path) と同じ表記）。 */
export function storedImagePath(filename: string): string {
  return join(imageDir(), filename);
}

export function thumbnailsDir(): string {
  return join(imageDir(), "thumbnails");
}

/** セパレータ境界を含めた配下判定（テスト用に公開）。 */
export function isUnderDir(dir: string, target: string): boolean {
  const normalizedDir = dir.endsWith(sep) ? dir.slice(0, -1) : dir;
  return (
    target === normalizedDir || target.startsWith(`${normalizedDir}${sep}`)
  );
}
