import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  sampleNamecard,
  sampleRelationshipTree,
  sampleTags,
} from "@/__tests__/utils/fixtures";
import {
  renderWithProviders,
  userEvent,
} from "@/__tests__/utils/renderWithProviders";
import { NameCardForm } from "@/components/namecard/NameCardForm";

const CONTACT_METHOD_TYPES = [
  "email",
  "tel",
  "mobile",
  "fax",
  "website",
  "x",
  "instagram",
  "youtube",
  "discord",
  "booth",
  "github",
  "linkedin",
  "facebook",
  "line",
  "tiktok",
  "address",
  "other",
] as const;

describe("NameCardForm", () => {
  it("test_namecard_form_renders_required_fields", () => {
    renderWithProviders(<NameCardForm />);

    expect(screen.getByLabelText(/姓/)).toBeInTheDocument();
    expect(screen.getByLabelText(/名/)).toBeInTheDocument();
  });

  it("test_namecard_form_renders_optional_fields", () => {
    renderWithProviders(<NameCardForm />);

    expect(screen.getByLabelText(/カナ/)).toBeInTheDocument();
    expect(screen.getByLabelText(/メモ/)).toBeInTheDocument();
  });

  it("test_namecard_form_submit_success", async () => {
    const handler = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<NameCardForm onSubmit={handler} />);

    await user.type(screen.getByLabelText(/姓/), "田中");
    await user.type(screen.getByLabelText(/名/), "太郎");
    await user.click(screen.getByRole("button", { name: /保存|送信|登録/ }));

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        last_name: "田中",
        first_name: "太郎",
      }),
    );
  });

  it("test_namecard_form_validation_required_first_name", async () => {
    const user = userEvent.setup();

    renderWithProviders(<NameCardForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText(/姓/), "田中");
    await user.click(screen.getByRole("button", { name: /保存|送信|登録/ }));

    expect(screen.getByText(/名は必須/)).toBeInTheDocument();
  });

  it("test_namecard_form_validation_required_last_name", async () => {
    const user = userEvent.setup();

    renderWithProviders(<NameCardForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText(/名/), "太郎");
    await user.click(screen.getByRole("button", { name: /保存|送信|登録/ }));

    expect(screen.getByText(/姓は必須/)).toBeInTheDocument();
  });

  it("test_namecard_form_add_contact_method", async () => {
    const user = userEvent.setup();

    renderWithProviders(<NameCardForm />);

    const addButton = screen.getByRole("button", { name: /連絡先を追加/ });
    await user.click(addButton);

    const contactRows = screen.getAllByTestId("contact-method-row");
    expect(contactRows).toHaveLength(1);
  });

  it("test_namecard_form_remove_contact_method", async () => {
    const user = userEvent.setup();

    renderWithProviders(<NameCardForm />);

    const addButton = screen.getByRole("button", { name: /連絡先を追加/ });
    await user.click(addButton);
    await user.click(addButton);

    expect(screen.getAllByTestId("contact-method-row")).toHaveLength(2);

    const deleteButtons = screen.getAllByRole("button", { name: /削除/ });
    await user.click(deleteButtons[0]);

    expect(screen.getAllByTestId("contact-method-row")).toHaveLength(1);
  });

  it("test_namecard_form_contact_method_type_select", async () => {
    const user = userEvent.setup();

    renderWithProviders(<NameCardForm />);

    await user.click(screen.getByRole("button", { name: /連絡先を追加/ }));

    const typeSelect = screen.getByRole("combobox", { name: /タイプ|種別/ });
    await user.click(typeSelect);
    await user.click(screen.getByRole("option", { name: /email/i }));

    expect(typeSelect).toHaveTextContent(/email/i);
  });

  it("test_namecard_form_contact_method_type_enum", async () => {
    const user = userEvent.setup();

    renderWithProviders(<NameCardForm />);

    await user.click(screen.getByRole("button", { name: /連絡先を追加/ }));

    const typeSelect = screen.getByRole("combobox", { name: /タイプ|種別/ });
    await user.click(typeSelect);

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(CONTACT_METHOD_TYPES.length);

    for (const type of CONTACT_METHOD_TYPES) {
      expect(
        screen.getByRole("option", { name: new RegExp(`^${type}$`, "i") }),
      ).toBeInTheDocument();
    }
  });

  it("test_namecard_form_prefill_data", () => {
    renderWithProviders(<NameCardForm defaultValues={sampleNamecard} />);

    expect(screen.getByLabelText(/姓/)).toHaveValue("田中");
    expect(screen.getByLabelText(/名/)).toHaveValue("太郎");
  });

  it("test_namecard_form_prefill_contact_methods", () => {
    const cardWithTwoContacts = {
      ...sampleNamecard,
      contact_methods: [
        { type: "email", value: "tanaka@example.com", label: "仕事" },
        { type: "tel", value: "090-1234-5678", label: "携帯" },
      ],
    };

    renderWithProviders(<NameCardForm defaultValues={cardWithTwoContacts} />);

    const contactRows = screen.getAllByTestId("contact-method-row");
    expect(contactRows).toHaveLength(2);
  });

  it("test_namecard_form_relationship_select", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <NameCardForm relationships={sampleRelationshipTree} />,
    );

    const relSelect = screen.getByRole("combobox", { name: /所属|関係/ });
    await user.click(relSelect);
    await user.click(
      screen.getByRole("option", { name: /建築士会\/桑名支部/ }),
    );

    expect(screen.getByText(/建築士会\/桑名支部/)).toBeInTheDocument();
  });

  it("test_namecard_form_multiple_relationships", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <NameCardForm relationships={sampleRelationshipTree} />,
    );

    const relSelect = screen.getByRole("combobox", { name: /所属|関係/ });

    await user.click(relSelect);
    await user.click(
      screen.getByRole("option", { name: /建築士会\/桑名支部/ }),
    );

    await user.click(relSelect);
    await user.click(screen.getByRole("option", { name: /ゴルフ仲間/ }));

    expect(screen.getByText(/建築士会\/桑名支部/)).toBeInTheDocument();
    expect(screen.getByText(/ゴルフ仲間/)).toBeInTheDocument();
  });

  it("test_namecard_form_tag_select", async () => {
    const user = userEvent.setup();

    renderWithProviders(<NameCardForm tags={sampleTags} />);

    const tagSelect = screen.getByRole("combobox", { name: /タグ/ });
    await user.click(tagSelect);
    await user.click(screen.getByRole("option", { name: /取引先/ }));

    expect(screen.getByText("取引先")).toBeInTheDocument();
  });

  it("test_namecard_form_multiple_tags", async () => {
    const user = userEvent.setup();

    renderWithProviders(<NameCardForm tags={sampleTags} />);

    const tagSelect = screen.getByRole("combobox", { name: /タグ/ });

    for (const tag of sampleTags) {
      await user.click(tagSelect);
      await user.click(
        screen.getByRole("option", { name: new RegExp(tag.name) }),
      );
    }

    for (const tag of sampleTags) {
      expect(screen.getByText(tag.name)).toBeInTheDocument();
    }
  });
});
