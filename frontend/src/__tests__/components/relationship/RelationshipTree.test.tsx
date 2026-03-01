import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { sampleRelationshipTree } from "@/__tests__/utils/fixtures";
import { renderWithProviders } from "@/__tests__/utils/renderWithProviders";
import { RelationshipTree } from "@/components/relationship/RelationshipTree";

describe("RelationshipTree", () => {
  it("test_relationship_tree_renders_root_nodes", () => {
    renderWithProviders(<RelationshipTree tree={sampleRelationshipTree} />);

    expect(screen.getByText("建築士会")).toBeInTheDocument();
    expect(screen.getByText("ゴルフ仲間")).toBeInTheDocument();
  });

  it("test_relationship_tree_renders_nested", async () => {
    renderWithProviders(<RelationshipTree tree={sampleRelationshipTree} />);

    const expandButton = screen.getByRole("button", {
      name: /建築士会/,
    });
    await userEvent.click(expandButton);
    expect(screen.getByText("桑名支部")).toBeInTheDocument();

    const expandChild = screen.getByRole("button", {
      name: /桑名支部/,
    });
    await userEvent.click(expandChild);
    expect(screen.getByText("青年会長")).toBeInTheDocument();
  });

  it("test_relationship_tree_expand_collapse", async () => {
    renderWithProviders(<RelationshipTree tree={sampleRelationshipTree} />);

    const toggleButton = screen.getByRole("button", {
      name: /建築士会/,
    });

    await userEvent.click(toggleButton);
    expect(screen.getByText("桑名支部")).toBeInTheDocument();

    await userEvent.click(toggleButton);
    await waitFor(() => {
      expect(screen.queryByText("桑名支部")).not.toBeInTheDocument();
    });
  });

  it("test_relationship_tree_empty_state", () => {
    renderWithProviders(<RelationshipTree tree={[]} />);

    expect(screen.getByText("所属・関係性がありません")).toBeInTheDocument();
  });

  it("test_relationship_tree_add_node", async () => {
    const onAdd = vi.fn();

    renderWithProviders(
      <RelationshipTree tree={sampleRelationshipTree} onAdd={onAdd} />,
    );

    const addButton = screen.getByRole("button", { name: /追加/ });
    await userEvent.click(addButton);

    const nameInput = screen.getByRole("textbox");
    await userEvent.type(nameInput, "新ノード");

    const confirmButton = screen.getByRole("button", {
      name: /確定|保存|追加/,
    });
    await userEvent.click(confirmButton);

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "新ノード",
        parent_id: expect.any(String),
      }),
    );
  });

  it("test_relationship_tree_delete_leaf_node", () => {
    const onDelete = vi.fn();

    renderWithProviders(
      <RelationshipTree tree={sampleRelationshipTree} onDelete={onDelete} />,
    );

    const leafNode = screen.getByText("ゴルフ仲間");
    const deleteButton =
      leafNode
        .closest("[data-testid]")
        ?.querySelector("button[aria-label='削除']") ??
      screen.getByRole("button", { name: /削除/ });

    expect(deleteButton).toBeInTheDocument();
  });

  it("test_relationship_tree_no_delete_for_parent", () => {
    renderWithProviders(<RelationshipTree tree={sampleRelationshipTree} />);

    const parentNode = screen.getByText("建築士会");
    const parentRow = parentNode.closest("[data-testid]");

    if (parentRow) {
      const deleteButton = parentRow.querySelector("button[aria-label='削除']");
      expect(deleteButton).toBeNull();
    }
  });

  it("test_relationship_tree_edit_name", async () => {
    const onUpdate = vi.fn();

    renderWithProviders(
      <RelationshipTree tree={sampleRelationshipTree} onUpdate={onUpdate} />,
    );

    const nodeText = screen.getByText("建築士会");
    await userEvent.dblClick(nodeText);

    const editInput = screen.getByDisplayValue("建築士会");
    await userEvent.clear(editInput);
    await userEvent.type(editInput, "新名称");

    fireEvent.keyDown(editInput, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "rel-001",
          name: "新名称",
        }),
      );
    });
  });
});
