"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from "react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

export interface ToastContextValue {
  toasts: Toast[];
  toast: (opts: { message: string; type: ToastType }) => void;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

interface ToastProviderProps {
  children: ReactNode;
}

let toastCounter = 0;

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (opts: { message: string; type: ToastType }) => {
      const id = `toast-${++toastCounter}`;
      const newToast: Toast = { id, ...opts };

      setToasts((prev) => [...prev, newToast]);

      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        dismiss(id);
      }, 5000);
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({ toasts, toast, dismiss }),
    [toasts, toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
  );
}
