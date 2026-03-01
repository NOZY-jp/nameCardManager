import { vi } from "vitest";
import { mockAxiosInstance } from "@/__tests__/utils/mocks/axios";

const axios = {
  default: {
    create: vi.fn(() => mockAxiosInstance),
    isAxiosError: vi.fn(
      (err: unknown) =>
        typeof err === "object" && err !== null && "isAxiosError" in err,
    ),
  },
};

export default axios.default;
export const { isAxiosError } = axios.default;
export const { create } = axios.default;
