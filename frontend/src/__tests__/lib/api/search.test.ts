import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios");

import {
  mockAxiosInstance,
  resetAxiosMock,
} from "@/__tests__/utils/mocks/axios";
import { searchApi } from "@/lib/api/search";

describe("search API", () => {
  beforeEach(() => {
    resetAxiosMock();
  });

  it("sends query params for keyword search", async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: { items: [], total: 0 } });

    await searchApi.search({ q: "田中", page: 1 });

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      expect.stringContaining("/search"),
      expect.objectContaining({
        params: expect.objectContaining({ q: "田中", page: 1 }),
      }),
    );
  });

  it("sends filter params for filtered search", async () => {
    mockAxiosInstance.get.mockResolvedValue({ data: { items: [], total: 0 } });

    await searchApi.search({
      q: "田中",
      tag_ids: "1,2",
      relationship_ids: "3",
    });

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      expect.stringContaining("/search"),
      expect.objectContaining({
        params: expect.objectContaining({
          q: "田中",
          tag_ids: "1,2",
          relationship_ids: "3",
        }),
      }),
    );
  });
});
