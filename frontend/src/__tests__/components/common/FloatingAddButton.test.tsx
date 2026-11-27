import { screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/__tests__/utils/renderWithProviders";
import { FloatingAddButton } from "@/components/common/FloatingAddButton";

describe("FloatingAddButton", () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue("/namecards");
  });

  it("is visible on the name card list", () => {
    renderWithProviders(<FloatingAddButton />);

    expect(
      screen.getByRole("link", { name: "新規名刺登録" }),
    ).toBeInTheDocument();
  });

  it("is hidden throughout the new name card flow", () => {
    vi.mocked(usePathname).mockReturnValue("/namecards/new");

    renderWithProviders(<FloatingAddButton />);

    expect(
      screen.queryByRole("link", { name: "新規名刺登録" }),
    ).not.toBeInTheDocument();
  });
});
