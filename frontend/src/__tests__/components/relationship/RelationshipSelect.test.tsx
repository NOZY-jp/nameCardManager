import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RelationshipSelect } from "@/components/relationship/RelationshipSelect";
import { sampleRelationshipTree } from "@/__tests__/utils/fixtures";
import { renderWithProviders } from "@/__tests__/utils/renderWithProviders";

describe("RelationshipSelect", () => {
  it("test_relationship_select_renders_tree", async () => {
    const onChange = vi.fn();

    renderWithProviders(
      <RelationshipSelect
        tree={sampleRelationshipTree}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("combobox");
    await userEvent.click(trigger);

    expect(screen.getByText("建築士会")).toBeInTheDocument();
    expect(screen.getByText("ゴルフ仲間")).toBeInTheDocument();
  });

  it("test_relationship_select_selects_node", async () => {
    const onChange = vi.fn();

    renderWithProviders(
      <RelationshipSelect
        tree={sampleRelationshipTree}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("combobox");
    await userEvent.click(trigger);

    const expandButton = screen.getByRole("button", {
      name: /建築士会/,
    });
    await userEvent.click(expandButton);

    const node = screen.getByText("桑名支部");
    await userEvent.click(node);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "rel-002" }),
    );
  });

  it("test_relationship_select_shows_full_path", async () => {
    const onChange = vi.fn();

    renderWithProviders(
      <RelationshipSelect
        tree={sampleRelationshipTree}
        value="rel-003"
        onChange={onChange}
      />,
    );

    expect(
      screen.getByText("建築士会/桑名支部/青年会長"),
    ).toBeInTheDocument();
  });

  it("test_relationship_select_multiple", async () => {
    const onChange = vi.fn();

    renderWithProviders(
      <RelationshipSelect
        tree={sampleRelationshipTree}
        multiple
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("combobox");
    await userEvent.click(trigger);

    const node1 = screen.getByText("ゴルフ仲間");
    await userEvent.click(node1);

    const expandButton = screen.getByRole("button", {
      name: /建築士会/,
    });
    await userEvent.click(expandButton);

    const node2 = screen.getByText("桑名支部");
    await userEvent.click(node2);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(2);
    });
  });
});
