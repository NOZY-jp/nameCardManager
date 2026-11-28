// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_UPLOADS_PER_USER,
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
