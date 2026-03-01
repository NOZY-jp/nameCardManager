import { describe, expect, it, vi } from "vitest";

vi.mock("axios");

import axios from "axios";
import { mockAxiosInstance } from "@/__tests__/utils/mocks/axios";
import { apiClient } from "@/lib/api/client";

describe("API client", () => {
  it("creates axios instance with correct base URL and headers", () => {
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: expect.any(String),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("registers request interceptor for auth token", () => {
    expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
  });

  it("registers response interceptor for 401 handling", () => {
    expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
  });

  it("exports apiClient as the created instance", () => {
    expect(apiClient).toBe(mockAxiosInstance);
  });
});
