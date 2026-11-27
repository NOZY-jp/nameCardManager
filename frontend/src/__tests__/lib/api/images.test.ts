import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios");

import {
  mockAxiosInstance,
  resetAxiosMock,
} from "@/__tests__/utils/mocks/axios";
import { imageApi } from "@/lib/api/images";

describe("images API", () => {
  beforeEach(() => {
    resetAxiosMock();
  });

  it("uploads image as multipart/form-data", async () => {
    mockAxiosInstance.post.mockResolvedValue({
      data: { upload_id: "uuid-123" },
    });

    const file = new File(["dummy"], "photo.jpg", { type: "image/jpeg" });
    await imageApi.upload(file);

    // 境界文字列は axios に決めさせるため Content-Type は指定しない（undefined）
    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      expect.stringContaining("/images/upload"),
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": undefined }),
      }),
    );

    const body = mockAxiosInstance.post.mock.calls[0][1];
    expect(Object.prototype.toString.call(body)).toBe("[object FormData]");
  });

  it("sends corners for image processing", async () => {
    mockAxiosInstance.post.mockResolvedValue({ data: {} });

    const corners = [
      { x: 10, y: 20 },
      { x: 200, y: 20 },
      { x: 200, y: 300 },
      { x: 10, y: 300 },
    ];

    await imageApi.process({ upload_id: "uuid-123", corners });

    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      expect.stringContaining("/images/process"),
      expect.objectContaining({
        upload_id: "uuid-123",
        corners: expect.arrayContaining([
          expect.objectContaining({ x: 10, y: 20 }),
        ]),
      }),
    );
  });
});
