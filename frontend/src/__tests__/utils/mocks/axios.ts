import { vi } from "vitest";

/**
 * Shared mock axios instance used by all API tests.
 * This is returned by `axios.create()` in the `__mocks__/axios.ts` automatic mock.
 *
 * Test files should:
 * 1. Call `vi.mock("axios")` at the top level (no factory needed — uses __mocks__/axios.ts)
 * 2. Import `mockAxiosInstance` from this module to set up per-test return values
 * 3. Call `resetAxiosMock()` in `beforeEach` to reset all method mocks
 */
export const mockAxiosInstance = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  request: vi.fn(),
  interceptors: {
    request: { use: vi.fn(), eject: vi.fn() },
    response: { use: vi.fn(), eject: vi.fn() },
  },
  defaults: { headers: { common: {} as Record<string, string> } },
};

export function resetAxiosMock() {
  for (const method of [
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "request",
  ] as const) {
    mockAxiosInstance[method].mockReset();
  }
}
