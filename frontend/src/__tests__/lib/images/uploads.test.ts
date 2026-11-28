// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_UPLOAD_ENTRIES,
  MAX_UPLOADS_PER_USER,
  peekUpload,
  putUpload,
  resetUploadStore,
  takeUpload,
  uploadStoreSize,
} from "@/lib/images/uploads";

beforeEach(() => {
  resetUploadStore();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-28T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  resetUploadStore();
});

describe("upload store limits", () => {
  it("ユーザーあたりの件数上限を超えたら最古を追い出す", () => {
    const first = putUpload(1, Buffer.alloc(10));
    for (let i = 0; i < MAX_UPLOADS_PER_USER; i += 1)
      putUpload(1, Buffer.alloc(10));
    expect(uploadStoreSize()).toBe(MAX_UPLOADS_PER_USER);
    expect(takeUpload(1, first)).toBeNull();
  });

  it("ユーザー上限超過は他ユーザーの保持を消さない", () => {
    const other = putUpload(2, Buffer.alloc(10));
    const user1First = putUpload(1, Buffer.alloc(10));
    for (let i = 0; i < MAX_UPLOADS_PER_USER; i += 1)
      putUpload(1, Buffer.alloc(10));
    expect(uploadStoreSize()).toBe(MAX_UPLOADS_PER_USER + 1);
    expect(takeUpload(2, other)).not.toBeNull();
    expect(takeUpload(1, user1First)).toBeNull();
  });

  it("グローバル上限では直近に使った保持を残す（LRU）", () => {
    const keep = putUpload(99, Buffer.alloc(10));
    // 199件まで（ユーザー上限20を守る）: 9人×20 + 1人×19
    let added = 0;
    for (let user = 0; user < 10 && added < MAX_UPLOAD_ENTRIES - 1; user += 1) {
      for (
        let i = 0;
        i < MAX_UPLOADS_PER_USER && added < MAX_UPLOAD_ENTRIES - 1;
        i += 1
      ) {
        putUpload(user, Buffer.alloc(10));
        added += 1;
      }
    }
    expect(uploadStoreSize()).toBe(MAX_UPLOAD_ENTRIES);
    vi.advanceTimersByTime(1000);
    expect(peekUpload(99, keep)).not.toBeNull(); // 直近使用を記録
    putUpload(100, Buffer.alloc(10)); // 201件目で LRU 追い出し
    expect(uploadStoreSize()).toBe(MAX_UPLOAD_ENTRIES);
    expect(takeUpload(99, keep)).not.toBeNull();
  });

  it("TTL を過ぎた保持は掃除される", () => {
    const id = putUpload(1, Buffer.alloc(10));
    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(takeUpload(1, id)).toBeNull();
    expect(uploadStoreSize()).toBe(0);
  });

  it("他ユーザーの upload_id は取得できない", () => {
    const id = putUpload(1, Buffer.alloc(10));
    expect(takeUpload(2, id)).toBeNull();
    expect(takeUpload(1, id)).not.toBeNull();
  });
});
