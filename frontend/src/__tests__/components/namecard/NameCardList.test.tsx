import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  sampleNamecard,
  sampleNamecardMinimal,
} from "@/__tests__/utils/fixtures";
import {
  renderWithProviders,
  userEvent,
} from "@/__tests__/utils/renderWithProviders";
import { NameCardList } from "@/components/namecard/NameCardList";

describe("NameCardList", () => {
  const threeCards = [
    sampleNamecard,
    sampleNamecardMinimal,
    { ...sampleNamecard, id: "nc-003", first_name: "次郎", last_name: "鈴木" },
  ];

  it("test_namecard_list_renders_items", () => {
    renderWithProviders(<NameCardList items={threeCards} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
  });

  it("test_namecard_list_empty_state", () => {
    renderWithProviders(<NameCardList items={[]} />);

    expect(screen.getByText("名刺がありません")).toBeInTheDocument();
  });

  it("test_namecard_list_pagination", () => {
    renderWithProviders(
      <NameCardList items={threeCards} total={50} page={1} perPage={20} />,
    );

    const nav = screen.getByRole("navigation");
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3/ })).toBeInTheDocument();
  });

  it("test_namecard_list_page_change", async () => {
    const handler = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <NameCardList
        items={threeCards}
        total={50}
        page={1}
        perPage={20}
        onPageChange={handler}
      />,
    );

    await user.click(screen.getByRole("button", { name: /2/ }));

    expect(handler).toHaveBeenCalledWith(2);
  });

  it("test_namecard_list_loading_state", () => {
    renderWithProviders(<NameCardList loading={true} />);

    const skeletons = screen.getAllByTestId("namecard-skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
