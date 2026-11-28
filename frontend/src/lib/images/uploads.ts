/** アップロード画像の一時保持（TTL・件数・合計バイト・ユーザー件数の上限つき）。 */
type UploadEntry = {
  userId: number;
  bytes: Buffer;
  createdAt: number;
  lastUsedAt: number;
};

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

function oldestKey(predicate: (entry: UploadEntry) => boolean): string | null {
  let best: { key: string; used: number } | null = null;
  for (const [key, entry] of store) {
    if (!predicate(entry)) continue;
    if (!best || entry.lastUsedAt < best.used)
      best = { key, used: entry.lastUsedAt };
  }
  return best?.key ?? null;
}

function evictOldestForUser(userId: number): void {
  const key = oldestKey((entry) => entry.userId === userId);
  if (key) store.delete(key);
}

function evictGlobalLeastRecentlyUsed(): void {
  const key = oldestKey(() => true);
  if (key) store.delete(key);
}

function cleanup(now: number): void {
  for (const [id, entry] of store) {
    if (now - entry.createdAt > UPLOAD_TTL_MS) store.delete(id);
  }
}

/**
 * 保持を追加する。
 * - ユーザー上限（20件）超過時は**そのユーザーの最古だけ**を追い出す（他ユーザーに触らない）。
 * - グローバル上限（200件/200MB）は全体の最終使用が古いものから追い出す（LRU）。
 */
export function putUpload(userId: number, bytes: Buffer): string {
  const now = Date.now();
  cleanup(now);

  let userCount = 0;
  for (const entry of store.values())
    if (entry.userId === userId) userCount += 1;
  while (userCount >= MAX_UPLOADS_PER_USER) {
    evictOldestForUser(userId);
    userCount -= 1;
  }
  while (
    store.size >= MAX_UPLOAD_ENTRIES ||
    totalBytes() + bytes.length > MAX_TOTAL_BYTES
  ) {
    const before = store.size;
    evictGlobalLeastRecentlyUsed();
    if (store.size === before) break; // 空で追い出せない（1件が総量上限超）
  }

  const id = crypto.randomUUID();
  store.set(id, { userId, bytes, createdAt: now, lastUsedAt: now });
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
  if (!entry || entry.userId !== userId) return null;
  entry.lastUsedAt = Date.now();
  return entry.bytes;
}

/** テスト用: ストアを空にする。 */
export function resetUploadStore(): void {
  store.clear();
}

/** テスト用: 保持件数。 */
export function uploadStoreSize(): number {
  return store.size;
}
