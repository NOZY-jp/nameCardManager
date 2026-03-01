import { screen } from "@testing-library/react";
import {
  renderWithProviders,
  userEvent,
} from "@/__tests__/utils/renderWithProviders";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const options = [
  { value: "email", label: "メール" },
  { value: "tel", label: "電話" },
];

function TestSelect({
  placeholder,
  onValueChange,
}: {
  placeholder?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <Select onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder ?? "選択してください"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

describe("Select", () => {
  it("renders options when opened", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TestSelect />);

    await user.click(screen.getByRole("combobox"));

    expect(screen.getByText("メール")).toBeInTheDocument();
    expect(screen.getByText("電話")).toBeInTheDocument();
  });

  it("selecting an option fires onValueChange with value", async () => {
    const handler = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<TestSelect onValueChange={handler} />);

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByText("メール"));

    expect(handler).toHaveBeenCalledWith("email");
  });

  it("shows placeholder when no selection", () => {
    renderWithProviders(<TestSelect placeholder="選択してください" />);

    expect(screen.getByText("選択してください")).toBeInTheDocument();
  });
});
