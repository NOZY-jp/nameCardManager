import { screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { sampleNamecard } from "@/__tests__/utils/fixtures";
import {
  renderWithProviders,
  userEvent,
} from "@/__tests__/utils/renderWithProviders";
import { NameCardItem } from "@/components/namecard/NameCardItem";

// AuthImage は認証付き API から blob を取得するため、テストでは img に置き換える。
vi.mock("@/components/ui/auth-image", () => ({
  AuthImage: ({ apiPath, alt }: { apiPath: string; alt: string }) => (
    // biome-ignore lint/performance/noImgElement: テスト用のスタブ
    <img src={apiPath} alt={alt} />
  ),
}));

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
    images: [
      {
        id: 1,
        image_path: "sample/front.webp",
        position: 0,
        created_at: "2026-01-15T09:00:00Z",
      },
    ],
  };

  const cardWithoutImage = {
    ...sampleNamecard,
    image_path: null,
    image_front_url: null,
    images: [],
  };

  it("test_namecard_item_renders_name", () => {
    renderWithProviders(<NameCardItem card={sampleNamecard} />);

    expect(screen.getByText("田中 太郎")).toBeInTheDocument();
  });

  it("test_namecard_item_renders_company", () => {
    renderWithProviders(<NameCardItem card={cardWithRelationships} />);

    expect(
      screen.getByText("株式会社テスト / 営業部 / 部長"),
    ).toBeInTheDocument();
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
      expect.stringContaining("/images/nc-001/thumbnail"),
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
