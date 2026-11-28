/** アップロード画像の一時保持（TTL・件数・合計バイト・ユーザー件数の上限つき）。 */
type UploadEntry = { userId: number; bytes: Buffer; createdAt: number };

export const UPLOAD_TTL_MS = 30 * 60 * 1000;
export const MAX_UPLOAD_ENTRIES = 200;
export const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
export const MAX_UPLOADS_PER_USER = 20;

const globalStore = globalThis as unknown as {
  __namecardUploads?: Map<string, UploadEntry>;
};
if (!globalStore.__namecardUploads) {
  globalStore.__namecardUploads = new Map();
}
const store = globalStore.__namecardUploads;

function totalBytes(): number {
  let total = 0;
  for (const entry of store.values()) total += entry.bytes.length;
  return total;
}

function countForUser(userId: number): number {
  let count = 0;
  for (const entry of store.values()) if (entry.userId === userId) count += 1;
  return count;
}

function evictOldest(): void {
  const oldest = store.keys().next();
  if (!oldest.done) store.delete(oldest.value);
}

function cleanup(now: number): void {
  for (const [id, entry] of store) {
    if (now - entry.createdAt > UPLOAD_TTL_MS) store.delete(id);
  }
}

export function putUpload(userId: number, bytes: Buffer): string {
  const now = Date.now();
  cleanup(now);
  // 上限を超える分は最古から追い出す（1件が上限を超える場合は呼び出し側で 413）。
  while (
    store.size >= MAX_UPLOAD_ENTRIES ||
    totalBytes() + bytes.length > MAX_TOTAL_BYTES ||
    countForUser(userId) >= MAX_UPLOADS_PER_USER
  ) {
    const before = store.size;
    evictOldest();
    if (store.size === before) break; // 空で追い出せない（1件が総量上限超）
  }
  const id = crypto.randomUUID();
  store.set(id, { userId, bytes, createdAt: now });
  return id;
}

export function takeUpload(userId: number, uploadId: string): Buffer | null {
  cleanup(Date.now());
  const entry = store.get(uploadId);
  if (!entry || entry.userId !== userId) return null;
  store.delete(uploadId);
  return entry.bytes;
}

export function peekUpload(userId: number, uploadId: string): Buffer | null {
  const entry = store.get(uploadId);
  return entry && entry.userId === userId ? entry.bytes : null;
}

/** テスト用: ストアを空にする。 */
export function resetUploadStore(): void {
  store.clear();
}

/** テスト用: 保持件数。 */
export function uploadStoreSize(): number {
  return store.size;
}
