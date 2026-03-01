import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios");

import {
  mockAxiosInstance,
  resetAxiosMock,
} from "@/__tests__/utils/mocks/axios";
import { namecardApi } from "@/lib/api/namecards";

describe("namecards API", () => {
  beforeEach(() => {
    resetAxiosMock();
  });

  it("calls GET /api/v1/namecards with pagination params", async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: { items: [], total: 0 } });

    await namecardApi.list({ page: 1, perPage: 20 });

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      expect.stringContaining("/namecards"),
      expect.objectContaining({
        params: expect.objectContaining({ page: 1, per_page: 20 }),
      }),
    );
  });

  it("calls POST /api/v1/namecards with body", async () => {
    mockAxiosInstance.post.mockResolvedValue({ data: {} });

    await namecardApi.create({ first_name: "太郎", last_name: "田中" });

    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      expect.stringContaining("/namecards"),
      expect.objectContaining({ first_name: "太郎", last_name: "田中" }),
    );
  });

  it("calls PATCH /api/v1/namecards/:id with body", async () => {
    mockAxiosInstance.patch.mockResolvedValue({ data: {} });

    await namecardApi.update(1, { first_name: "次郎" });

    expect(mockAxiosInstance.patch).toHaveBeenCalledWith(
      expect.stringMatching(/\/namecards\/1/),
      expect.objectContaining({ first_name: "次郎" }),
    );
  });

  it("calls DELETE /api/v1/namecards/:id", async () => {
    mockAxiosInstance.delete.mockResolvedValue({ data: {} });

    await namecardApi.delete(1);

    expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
      expect.stringMatching(/\/namecards\/1/),
    );
  });
});
