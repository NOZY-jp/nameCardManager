import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRouterMock } from "@/__tests__/utils/mocks/router";
import { renderWithProviders } from "@/__tests__/utils/renderWithProviders";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const authenticatedUser = {
  id: 1,
  email: "test@example.com",
  created_at: "2026-01-01T00:00:00Z",
};

describe("AuthGuard", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: authenticatedUser,
      login: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
    });
  });

  it("renders protected content for an authenticated user", () => {
    renderWithProviders(
      <AuthGuard>
        <p>名刺一覧</p>
      </AuthGuard>,
    );

    expect(screen.getByText("名刺一覧")).toBeInTheDocument();
  });

  it("hides protected content and redirects after logout", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
    });

    renderWithProviders(
      <AuthGuard>
        <p>名刺一覧</p>
      </AuthGuard>,
    );

    expect(screen.queryByText("名刺一覧")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(getRouterMock().replace).toHaveBeenCalledWith("/login");
    });
  });
});
