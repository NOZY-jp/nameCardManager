"use client";

import { useToast } from "@/hooks/useToast";
import styles from "./toast.module.scss";

export function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className={styles.toastContainer}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className={styles.toast}
          data-type={t.type}
          role="alert"
        >
          <span className={styles.toastMessage}>{t.message}</span>
          <button
            type="button"
            className={styles.toastClose}
            onClick={() => dismiss(t.id)}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
