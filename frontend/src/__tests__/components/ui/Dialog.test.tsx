import { screen, waitForElementToBeRemoved } from "@testing-library/react";
import {
  renderWithProviders,
  userEvent,
} from "@/__tests__/utils/renderWithProviders";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

function TestDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button">開く</button>
      </DialogTrigger>
      <DialogContent>
        <p>内容</p>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("opens when trigger is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TestDialog />);

    expect(screen.queryByText("内容")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "開く" }));

    expect(screen.getByText("内容")).toBeInTheDocument();
  });

  it("closes on Escape key", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TestDialog />);

    await user.click(screen.getByRole("button", { name: "開く" }));
    expect(screen.getByText("内容")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitForElementToBeRemoved(() => screen.queryByText("内容"));
  });

  it("closes on overlay click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TestDialog />);

    await user.click(screen.getByRole("button", { name: "開く" }));
    expect(screen.getByText("内容")).toBeInTheDocument();

    const overlay =
      document.querySelector("[data-overlay]") ??
      screen.getByRole("dialog").parentElement?.querySelector("[data-state]");

    if (overlay) {
      await user.click(overlay);
    }

    await waitForElementToBeRemoved(() => screen.queryByText("内容"));
  });
});
