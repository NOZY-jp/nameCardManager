import { screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { describe, expect, it } from "vitest";
import { sampleNamecard } from "@/__tests__/utils/fixtures";
import {
  renderWithProviders,
  userEvent,
} from "@/__tests__/utils/renderWithProviders";
import { NameCardItem } from "@/components/namecard/NameCardItem";

describe("NameCardItem", () => {
  const cardWithRelationships = {
    ...sampleNamecard,
    relationships: [
      {
        id: "rel-003",
        full_path: "建築士会/桑名支部/青年会長",
      },
    ],
  };

  const cardWithTags = {
    ...sampleNamecard,
    tags: [
      { id: "tag-001", name: "取引先" },
      { id: "tag-002", name: "友人" },
    ],
  };

  const cardWithImage = {
    ...sampleNamecard,
    image_path: "/images/1.webp",
  };

  const cardWithoutImage = {
    ...sampleNamecard,
    image_path: null,
    image_front_url: null,
  };

  it("test_namecard_item_renders_name", () => {
    renderWithProviders(<NameCardItem card={sampleNamecard} />);

    expect(screen.getByText("田中 太郎")).toBeInTheDocument();
  });

  it("test_namecard_item_renders_relationships", () => {
    renderWithProviders(<NameCardItem card={cardWithRelationships} />);

    expect(screen.getByText("建築士会/桑名支部/青年会長")).toBeInTheDocument();
  });

  it("test_namecard_item_renders_tags", () => {
    renderWithProviders(<NameCardItem card={cardWithTags} />);

    expect(screen.getByText("取引先")).toBeInTheDocument();
    expect(screen.getByText("友人")).toBeInTheDocument();
  });

  it("test_namecard_item_renders_thumbnail", () => {
    renderWithProviders(<NameCardItem card={cardWithImage} />);

    const img = screen.getByRole("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute(
      "src",
      expect.stringContaining("/images/1.webp"),
    );
  });

  it("test_namecard_item_no_thumbnail", () => {
    renderWithProviders(<NameCardItem card={cardWithoutImage} />);

    const placeholder = screen.getByTestId("namecard-placeholder-icon");
    expect(placeholder).toBeInTheDocument();
  });

  it("test_namecard_item_click_navigates", async () => {
    const user = userEvent.setup();
    const card = { ...sampleNamecard, id: "1" };

    renderWithProviders(<NameCardItem card={card} />);

    await user.click(screen.getByRole("listitem"));

    const router = useRouter();
    expect(router.push).toHaveBeenCalledWith("/namecards/1");
  });
});
