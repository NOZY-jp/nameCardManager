import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { sampleTags } from "@/__tests__/utils/fixtures";
import { renderWithProviders } from "@/__tests__/utils/renderWithProviders";
import { TagSelect } from "@/components/tag/TagSelect";

describe("TagSelect", () => {
  it("test_tag_select_renders_options", async () => {
    const onChange = vi.fn();

    renderWithProviders(<TagSelect tags={sampleTags} onChange={onChange} />);

    const trigger = screen.getByRole("combobox");
    await userEvent.click(trigger);

    expect(screen.getByText("取引先")).toBeInTheDocument();
    expect(screen.getByText("友人")).toBeInTheDocument();
    expect(screen.getByText("ゴルフ仲間")).toBeInTheDocument();
  });

  it("test_tag_select_selects_tag", async () => {
    const onChange = vi.fn();

    renderWithProviders(<TagSelect tags={sampleTags} onChange={onChange} />);

    const trigger = screen.getByRole("combobox");
    await userEvent.click(trigger);

    const option = screen.getByText("取引先");
    await userEvent.click(option);

    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "tag-001", name: "取引先" }),
      ]),
    );
  });

  it("test_tag_select_multiple", async () => {
    const onChange = vi.fn();

    renderWithProviders(
      <TagSelect tags={sampleTags} multiple onChange={onChange} />,
    );

    const trigger = screen.getByRole("combobox");
    await userEvent.click(trigger);

    await userEvent.click(screen.getByText("取引先"));
    await userEvent.click(screen.getByText("友人"));
    await userEvent.click(screen.getByText("ゴルフ仲間"));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(3);
    });
  });

  it("test_tag_select_deselect", async () => {
    const onChange = vi.fn();

    renderWithProviders(
      <TagSelect
        tags={sampleTags}
        value={[sampleTags[0]]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("combobox");
    await userEvent.click(trigger);

    const selectedOption = screen.getByText("取引先");
    await userEvent.click(selectedOption);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.not.arrayContaining([
          expect.objectContaining({ id: "tag-001" }),
        ]),
      );
    });
  });
});
