import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { resetRouterMock } from "@/__tests__/utils/mocks/router";

(globalThis as Record<string, unknown>).jest = vi;

afterEach(() => {
  cleanup();
  resetRouterMock();
});

// Mock next/navigation (uses shared routerMock for stable spy references)
vi.mock("next/navigation", async () => {
  const { getRouterMock } = await import("@/__tests__/utils/mocks/router");
  return {
    useRouter: () => getRouterMock(),
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => "/",
    useParams: () => ({}),
    redirect: vi.fn(),
    notFound: vi.fn(),
  };
});

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { priority: _priority, fill: _fill, ...rest } = props;
    // biome-ignore lint/performance/noImgElement: test mock for next/image
    return <img alt="" {...rest} />;
  },
}));

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  value: MockIntersectionObserver,
});

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock URL.createObjectURL
Object.defineProperty(URL, "createObjectURL", {
  writable: true,
  value: vi.fn(() => "blob:mock-url"),
});

Object.defineProperty(URL, "revokeObjectURL", {
  writable: true,
  value: vi.fn(),
});
