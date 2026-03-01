import { screen } from "@testing-library/react";
import {
  renderWithProviders,
  userEvent,
} from "@/__tests__/utils/renderWithProviders";
import { Input } from "@/components/ui/input";

describe("Input", () => {
  it("renders with placeholder", () => {
    renderWithProviders(<Input placeholder="名前を入力" />);
    expect(screen.getByPlaceholderText("名前を入力")).toBeInTheDocument();
  });

  it("typing fires onChange with value", async () => {
    const handler = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<Input onChange={handler} />);
    const input = screen.getByRole("textbox");

    await user.type(input, "田中");

    expect(handler).toHaveBeenCalled();
    expect(input).toHaveValue("田中");
  });

  it("error prop shows error message and error styling", () => {
    renderWithProviders(<Input error="必須項目です" />);

    expect(screen.getByText("必須項目です")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("disabled attribute is set", () => {
    renderWithProviders(<Input disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
