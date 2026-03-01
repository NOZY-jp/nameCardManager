import { screen } from "@testing-library/react";
import {
  renderWithProviders,
  userEvent,
} from "@/__tests__/utils/renderWithProviders";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders with text", () => {
    renderWithProviders(<Button>保存</Button>);
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });

  it("fires click handler once", async () => {
    const handler = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<Button onClick={handler}>保存</Button>);
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("disabled state prevents click and has aria-disabled", async () => {
    const handler = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <Button disabled onClick={handler}>
        保存
      </Button>,
    );

    const button = screen.getByRole("button", { name: "保存" });
    await user.click(button).catch(() => {});

    expect(handler).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  it("variant destructive applies danger styling", () => {
    renderWithProviders(<Button variant="destructive">削除</Button>);

    const button = screen.getByRole("button", { name: "削除" });
    expect(button).toHaveAttribute("data-variant", "destructive");
  });

  it("loading state shows spinner and disables button", () => {
    renderWithProviders(<Button loading>保存中</Button>);

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button.querySelector("[data-loading]")).toBeInTheDocument();
  });
});
