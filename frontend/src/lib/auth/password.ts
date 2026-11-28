/** パスワードの bcrypt ハッシュ化・検証（既存 FastAPI の `$2b$12$` と互換）。 */
import bcrypt from "bcryptjs";

export const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * 平文とハッシュを照合する。不正なハッシュ形式でも例外を投げず false を返す。
 */
export async function verifyPassword(
  plain: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
