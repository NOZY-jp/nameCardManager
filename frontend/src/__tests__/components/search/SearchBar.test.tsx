import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderWithProviders,
  userEvent,
} from "@/__tests__/utils/renderWithProviders";
import { SearchBar } from "@/components/search/SearchBar";

describe("SearchBar", () => {
  it("renders search input", () => {
    renderWithProviders(<SearchBar onSearch={vi.fn()} />);

    expect(
      screen.getByRole("searchbox") ?? screen.getByPlaceholderText(/検索/i),
    ).toBeInTheDocument();
  });

  it("reflects text input", async () => {
    renderWithProviders(<SearchBar onSearch={vi.fn()} />);

    const input = screen.getByRole("searchbox") ?? screen.getByPlaceholderText(/検索/i);
    await userEvent.setup().type(input, "田中");

    expect(input).toHaveValue("田中");
  });

  it("calls onSearch after debounce", async () => {
    vi.useFakeTimers();
    const handler = vi.fn();

    renderWithProviders(<SearchBar onSearch={handler} debounce={300} />);

    const input = screen.getByRole("searchbox") ?? screen.getByPlaceholderText(/検索/i);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(input, "田中");

    expect(handler).not.toHaveBeenCalledWith("田中");

    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(handler).toHaveBeenCalledWith("田中");
    });

    vi.useRealTimers();
  });

  it("clears input and calls onSearch with empty string", async () => {
    const handler = vi.fn();
    renderWithProviders(<SearchBar onSearch={handler} />);

    const input = screen.getByRole("searchbox") ?? screen.getByPlaceholderText(/検索/i);
    await userEvent.setup().type(input, "田中");

    const clearButton = screen.getByRole("button", { name: /クリア|clear|✕|×/i });
    await userEvent.setup().click(clearButton);

    expect(input).toHaveValue("");
    expect(handler).toHaveBeenCalledWith("");
  });
});
