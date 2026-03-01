import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleAuthTokens, sampleUser } from "@/__tests__/utils/fixtures";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/hooks/useAuth";

function createWrapper(initialUser?: typeof sampleUser | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <AuthProvider initialUser={initialUser}>{children}</AuthProvider>;
  };
}

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

describe("useAuth", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("returns user when authenticated", () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(sampleUser),
    });

    expect(result.current.user).toEqual(
      expect.objectContaining({ id: sampleUser.id, email: sampleUser.email }),
    );
  });

  it("returns null when unauthenticated", () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(null),
    });

    expect(result.current.user).toBeNull();
  });

  it("saves token on login", async () => {
    const { apiClient } = await import("@/lib/api/client");
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { ...sampleAuthTokens, user: sampleUser },
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(null),
    });

    await act(async () => {
      await result.current.login("test@example.com", "pass");
    });

    expect(localStorage.getItem("access_token")).toBeTruthy();
    expect(result.current.user).toBeTruthy();
  });

  it("removes token on logout", async () => {
    localStorage.setItem("access_token", sampleAuthTokens.access_token);

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(sampleUser),
    });

    act(() => {
      result.current.logout();
    });

    expect(localStorage.getItem("access_token")).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it("throws error on login failure", async () => {
    const { apiClient } = await import("@/lib/api/client");
    vi.mocked(apiClient.post).mockRejectedValue({
      response: { status: 401, data: { detail: "Invalid credentials" } },
      isAxiosError: true,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(null),
    });

    await expect(
      act(async () => {
        await result.current.login("test@example.com", "wrong");
      }),
    ).rejects.toBeTruthy();
  });
});
