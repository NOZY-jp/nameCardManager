import { vi } from "vitest";

const mockAxiosInstance = {
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
  defaults: {
    headers: {
      common: {} as Record<string, string>,
    },
  },
};

function createAxiosMock() {
  vi.mock("axios", () => ({
    default: {
      create: vi.fn(() => mockAxiosInstance),
      isAxiosError: vi.fn((err: unknown) => {
        return (
          typeof err === "object" &&
          err !== null &&
          "isAxiosError" in err
        );
      }),
    },
  }));

  return mockAxiosInstance;
}

function resetAxiosMock() {
  for (const method of ["get", "post", "put", "patch", "delete", "request"] as const) {
    mockAxiosInstance[method].mockReset();
  }
}

export { createAxiosMock, mockAxiosInstance, resetAxiosMock };
