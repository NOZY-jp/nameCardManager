/** 四隅補正（遠近変換）と WebP/サムネイル保存。 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { storedImagePath, thumbnailsDir } from "@/lib/images/paths";

export type Corner = { x: number; y: number };

export const OUTPUT_WIDTH = 910;
export const OUTPUT_HEIGHT = 550;
export const WEBP_QUALITY = 85;
export const THUMBNAIL_SIZE = { width: 300, height: 188 };
export const THUMBNAIL_QUALITY = 80;

type Matrix = number[]; // 8 coefficients (a..h)

/** dst(0,0),(W-1,0),(W-1,H-1),(0,H-1) → src の 4 点を写す射影行列を解く。 */
function solveHomography(src: Corner[], width: number, height: number): Matrix {
  const dst: Corner[] = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];
  // 未知数 a,b,c,d,e,f,g,h（u,v は dst 座標）
  const rows: number[][] = [];
  const rhs: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x: u, y: v } = dst[i];
    const { x, y } = src[i];
    rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    rhs.push(x);
    rows.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    rhs.push(y);
  }
  // ガウス消去
  for (let col = 0; col < 8; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 8; row += 1) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    }
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]];
    const divisor = rows[col][col];
    if (Math.abs(divisor) < 1e-12) throw new Error("degenerate corners");
    for (let k = col; k < 8; k += 1) rows[col][k] /= divisor;
    rhs[col] /= divisor;
    for (let row = 0; row < 8; row += 1) {
      if (row === col) continue;
      const factor = rows[row][col];
      if (factor === 0) continue;
      for (let k = col; k < 8; k += 1) rows[row][k] -= factor * rows[col][k];
      rhs[row] -= factor * rhs[col];
    }
  }
  return rhs;
}

function warpPerspective(
  input: Buffer,
  width: number,
  height: number,
  corners: Corner[],
  outWidth: number,
  outHeight: number,
): Buffer {
  const matrix = solveHomography(corners, outWidth, outHeight);
  const output = Buffer.alloc(outWidth * outHeight * 3);
  const channels = 3;
  for (let v = 0; v < outHeight; v += 1) {
    for (let u = 0; u < outWidth; u += 1) {
      const denominator = matrix[6] * u + matrix[7] * v + 1;
      const sx = (matrix[0] * u + matrix[1] * v + matrix[2]) / denominator;
      const sy = (matrix[3] * u + matrix[4] * v + matrix[5]) / denominator;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const target = (v * outWidth + u) * 3;
      if (x0 < 0 || y0 < 0 || x0 >= width - 1 || y0 >= height - 1) {
        output[target] = 255;
        output[target + 1] = 255;
        output[target + 2] = 255;
        continue;
      }
      const p00 = (y0 * width + x0) * channels;
      const p10 = (y0 * width + x0 + 1) * channels;
      const p01 = ((y0 + 1) * width + x0) * channels;
      const p11 = ((y0 + 1) * width + x0 + 1) * channels;
      for (let c = 0; c < channels; c += 1) {
        const top = input[p00 + c] * (1 - fx) + input[p10 + c] * fx;
        const bottom = input[p01 + c] * (1 - fx) + input[p11 + c] * fx;
        output[target + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return output;
}

/** 四隅補正して WebP（フル + サムネイル）を保存する。 */
export async function correctAndSave(
  imageBytes: Buffer,
  corners: Corner[],
): Promise<{ imagePath: string; thumbnailPath: string }> {
  if (corners.length !== 4)
    throw new Error("corners must have exactly 4 points");
  const { data, info } = await sharp(imageBytes)
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height) throw new Error("failed to decode image");

  const warped = warpPerspective(
    data,
    info.width,
    info.height,
    corners,
    OUTPUT_WIDTH,
    OUTPUT_HEIGHT,
  );
  const full = await sharp(warped, {
    raw: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 3 },
  })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  const thumbnail = await sharp(warped, {
    raw: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 3 },
  })
    .resize(THUMBNAIL_SIZE.width, THUMBNAIL_SIZE.height, { fit: "inside" })
    .webp({ quality: THUMBNAIL_QUALITY })
    .toBuffer();

  const filename = `${crypto.randomUUID()}.webp`;
  const imagePath = storedImagePath(filename);
  const thumbnailPath = join(thumbnailsDir(), filename);
  await mkdir(thumbnailsDir(), { recursive: true });
  await writeFile(imagePath, full);
  await writeFile(thumbnailPath, thumbnail);
  return { imagePath, thumbnailPath };
}

/** ファイル欠損時などに返す白い WebP（既存 FastAPI と同じ挙動）。 */
export async function placeholderWebp(
  width = 910,
  height = 550,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .webp()
    .toBuffer();
}
