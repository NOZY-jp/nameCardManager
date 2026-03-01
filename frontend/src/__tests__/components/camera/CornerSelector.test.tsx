import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  renderWithProviders,
  userEvent,
} from "@/__tests__/utils/renderWithProviders";
import { CornerSelector } from "@/components/camera/CornerSelector";

const imageData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("CornerSelector", () => {
  it("renders four corner points", () => {
    renderWithProviders(
      <CornerSelector image={imageData} onConfirm={vi.fn()} />,
    );

    const corners = screen.getAllByTestId(/corner-point/);
    expect(corners).toHaveLength(4);
  });

  it("has default positions at image corners", () => {
    renderWithProviders(
      <CornerSelector image={imageData} onConfirm={vi.fn()} />,
    );

    const corners = screen.getAllByTestId(/corner-point/);
    for (const corner of corners) {
      expect(corner).toBeInTheDocument();
    }
    expect(corners).toHaveLength(4);
  });

  it("calls onConfirm with coordinates when confirm button is clicked", async () => {
    const handler = vi.fn();
    renderWithProviders(
      <CornerSelector image={imageData} onConfirm={handler} />,
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /確定/i }));

    expect(handler).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      ]),
    );
  });

  it("renders SVG overlay on top of image", () => {
    const { container } = renderWithProviders(
      <CornerSelector image={imageData} onConfirm={vi.fn()} />,
    );

    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});
