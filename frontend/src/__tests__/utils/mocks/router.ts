import { vi } from "vitest";

const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

let currentPathname = "/";
let currentSearchParams = new URLSearchParams();
let currentParams: Record<string, string> = {};

function getRouterMock() {
  return routerMock;
}

function mockPathname(pathname: string) {
  currentPathname = pathname;
  const { usePathname } = vi.mocked(
    // biome-ignore lint: dynamic import mock
    require("next/navigation"),
  );
  usePathname.mockReturnValue(currentPathname);
}

function mockSearchParams(params: Record<string, string>) {
  currentSearchParams = new URLSearchParams(params);
  const { useSearchParams } = vi.mocked(
    // biome-ignore lint: dynamic import mock
    require("next/navigation"),
  );
  useSearchParams.mockReturnValue(currentSearchParams);
}

function mockParams(params: Record<string, string>) {
  currentParams = params;
  const { useParams } = vi.mocked(
    // biome-ignore lint: dynamic import mock
    require("next/navigation"),
  );
  useParams.mockReturnValue(currentParams);
}

function resetRouterMock() {
  for (const key of Object.keys(routerMock) as (keyof typeof routerMock)[]) {
    routerMock[key].mockReset();
  }
  currentPathname = "/";
  currentSearchParams = new URLSearchParams();
  currentParams = {};
}

export {
  getRouterMock,
  mockParams,
  mockPathname,
  mockSearchParams,
  resetRouterMock,
};
