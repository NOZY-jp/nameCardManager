/** アップロード画像の一時保持（プロセス内・30分TTL）。 */
type UploadEntry = { userId: number; bytes: Buffer; createdAt: number };

const TTL_MS = 30 * 60 * 1000;
const globalStore = globalThis as unknown as {
  __namecardUploads?: Map<string, UploadEntry>;
};
if (!globalStore.__namecardUploads) {
  globalStore.__namecardUploads = new Map();
}
const store = globalStore.__namecardUploads;

function cleanup(now: number) {
  for (const [id, entry] of store) {
    if (now - entry.createdAt > TTL_MS) store.delete(id);
  }
}

export function putUpload(userId: number, bytes: Buffer): string {
  const now = Date.now();
  cleanup(now);
  const id = crypto.randomUUID();
  store.set(id, { userId, bytes, createdAt: now });
  return id;
}

export function takeUpload(userId: number, uploadId: string): Buffer | null {
  const now = Date.now();
  cleanup(now);
  const entry = store.get(uploadId);
  if (!entry || entry.userId !== userId) return null;
  store.delete(uploadId);
  return entry.bytes;
}

export function peekUpload(userId: number, uploadId: string): Buffer | null {
  const entry = store.get(uploadId);
  return entry && entry.userId === userId ? entry.bytes : null;
}
