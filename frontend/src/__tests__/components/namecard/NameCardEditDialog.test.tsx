import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NameCardEditDialog } from "@/components/namecard/NameCardEditDialog";
import {
  renderWithProviders,
  userEvent,
} from "@/__tests__/utils/renderWithProviders";
import { sampleNamecard } from "@/__tests__/utils/fixtures";

describe("NameCardEditDialog", () => {
  const defaultProps = {
    card: sampleNamecard,
    open: true,
    onSave: vi.fn(),
    onClose: vi.fn(),
  };

  it("test_edit_dialog_opens_with_data", () => {
    renderWithProviders(<NameCardEditDialog {...defaultProps} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/姓/)).toHaveValue("田中");
    expect(screen.getByLabelText(/名/)).toHaveValue("太郎");
  });

  it("test_edit_dialog_submit_calls_update", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <NameCardEditDialog {...defaultProps} onSave={onSave} />,
    );

    await user.click(screen.getByRole("button", { name: /保存/ }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        last_name: "田中",
        first_name: "太郎",
      }),
    );
  });

  it("test_edit_dialog_cancel_closes", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <NameCardEditDialog {...defaultProps} onClose={onClose} />,
    );

    await user.click(screen.getByRole("button", { name: /キャンセル/ }));

    expect(onClose).toHaveBeenCalled();
  });

  it("test_edit_dialog_validation_error", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <NameCardEditDialog {...defaultProps} onSave={onSave} />,
    );

    await user.clear(screen.getByLabelText(/姓/));
    await user.click(screen.getByRole("button", { name: /保存/ }));

    expect(screen.getByText(/姓は必須/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});
