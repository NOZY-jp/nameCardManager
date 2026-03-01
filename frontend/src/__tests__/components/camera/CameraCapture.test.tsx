import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderWithProviders,
  userEvent,
} from "@/__tests__/utils/renderWithProviders";
import { CameraCapture } from "@/components/camera/CameraCapture";

const mockGetUserMedia = vi.fn();

beforeEach(() => {
  mockGetUserMedia.mockReset();
  Object.defineProperty(navigator, "mediaDevices", {
    writable: true,
    value: { getUserMedia: mockGetUserMedia },
  });
});

describe("CameraCapture", () => {
  it("renders camera guide frame", async () => {
    mockGetUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });

    renderWithProviders(<CameraCapture onCapture={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByTestId("camera-guide") ?? screen.getByRole("region"),
      ).toBeInTheDocument();
    });
  });

  it("renders capture button", async () => {
    mockGetUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });

    renderWithProviders(<CameraCapture onCapture={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /撮影/i })).toBeInTheDocument();
    });
  });

  it("calls onCapture handler when capture button is clicked", async () => {
    const handler = vi.fn();
    mockGetUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });

    renderWithProviders(<CameraCapture onCapture={handler} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /撮影/i })).toBeInTheDocument();
    });

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /撮影/i }));

    await waitFor(() => {
      expect(handler).toHaveBeenCalled();
    });
  });

  it("shows error message when camera permission is denied", async () => {
    mockGetUserMedia.mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError"),
    );

    renderWithProviders(<CameraCapture onCapture={vi.fn()} />);

    await waitFor(() => {
      expect(
        screen.getByText(/カメラへのアクセスが許可されていません|permission/i),
      ).toBeInTheDocument();
    });
  });
});
