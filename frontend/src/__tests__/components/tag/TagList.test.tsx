import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TagList } from "@/components/tag/TagList";
import { sampleTags } from "@/__tests__/utils/fixtures";
import { renderWithProviders } from "@/__tests__/utils/renderWithProviders";

describe("TagList", () => {
  it("test_tag_list_renders_tags", () => {
    renderWithProviders(<TagList tags={sampleTags} />);

    expect(screen.getByText("取引先")).toBeInTheDocument();
    expect(screen.getByText("友人")).toBeInTheDocument();
    expect(screen.getByText("ゴルフ仲間")).toBeInTheDocument();
  });

  it("test_tag_list_empty_state", () => {
    renderWithProviders(<TagList tags={[]} />);

    expect(screen.getByText("タグがありません")).toBeInTheDocument();
  });

  it("test_tag_list_add_tag", async () => {
    const onAdd = vi.fn();

    renderWithProviders(
      <TagList tags={sampleTags} onAdd={onAdd} />,
    );

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "新タグ");

    const addButton = screen.getByRole("button", { name: /追加/ });
    await userEvent.click(addButton);

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: "新タグ" }),
    );
  });

  it("test_tag_list_delete_tag", async () => {
    const onDelete = vi.fn();

    renderWithProviders(
      <TagList tags={sampleTags} onDelete={onDelete} />,
    );

    const tagElement = screen.getByText("取引先");
    const deleteButton = tagElement
      .closest("[data-testid]")
      ?.querySelector("button[aria-label='削除']") ??
      screen.getAllByRole("button", { name: /削除/ })[0];

    await userEvent.click(deleteButton!);

    expect(onDelete).toHaveBeenCalledWith("tag-001");
  });

  it("test_tag_list_edit_tag", async () => {
    const onUpdate = vi.fn();

    renderWithProviders(
      <TagList tags={sampleTags} onUpdate={onUpdate} />,
    );

    const tagElement = screen.getByText("取引先");
    await userEvent.dblClick(tagElement);

    const editInput = screen.getByDisplayValue("取引先");
    await userEvent.clear(editInput);
    await userEvent.type(editInput, "重要取引先");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "tag-001",
          name: "重要取引先",
        }),
      );
    });
  });

  it("test_tag_list_add_empty_name_validation", async () => {
    const onAdd = vi.fn();

    renderWithProviders(
      <TagList tags={sampleTags} onAdd={onAdd} />,
    );

    const addButton = screen.getByRole("button", { name: /追加/ });
    await userEvent.click(addButton);

    await waitFor(() => {
      expect(
        screen.getByText(/タグ名を入力してください|必須/),
      ).toBeInTheDocument();
    });

    expect(onAdd).not.toHaveBeenCalled();
  });
});
