import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/contexts/ToastContext";
import { useToast } from "@/hooks/useToast";

function Wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("useToast", () => {
  it("shows a toast notification", () => {
    const { result } = renderHook(() => useToast(), { wrapper: Wrapper });

    act(() => {
      result.current.toast({ message: "保存しました", type: "success" });
    });

    expect(result.current.toasts.length).toBeGreaterThan(0);
    expect(result.current.toasts[0]).toEqual(
      expect.objectContaining({ message: "保存しました", type: "success" }),
    );
  });

  it("auto-dismisses toast after timeout", async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => useToast(), { wrapper: Wrapper });

    act(() => {
      result.current.toast({ message: "保存しました", type: "success" });
    });

    expect(result.current.toasts.length).toBeGreaterThan(0);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      expect(result.current.toasts).toHaveLength(0);
    });

    vi.useRealTimers();
  });
});
