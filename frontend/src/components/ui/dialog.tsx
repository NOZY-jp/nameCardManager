"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import styles from "./dialog.module.scss";

// ── Context ─────────────────────────────────────────────
interface DialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DialogContext = createContext<DialogContextValue>({
  open: false,
  setOpen: () => {},
});

// ── Dialog (root) ───────────────────────────────────────
interface DialogProps {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Dialog({
  children,
  open: controlledOpen,
  onOpenChange,
}: DialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = useCallback(
    (value: boolean) => {
      if (!isControlled) {
        setInternalOpen(value);
      }
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange],
  );

  const value = useMemo(() => ({ open, setOpen }), [open, setOpen]);

  return (
    <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
  );
}

// ── DialogTrigger ───────────────────────────────────────
interface DialogTriggerProps {
  children: ReactNode;
  asChild?: boolean;
}

export function DialogTrigger({ children, asChild }: DialogTriggerProps) {
  const { setOpen } = useContext(DialogContext);

  const handleClick = () => setOpen(true);

  if (asChild && children) {
    // Clone the child element and add onClick
    const child = children as React.ReactElement<{
      onClick?: () => void;
    }>;
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: wrapper delegates click to child dialog trigger
      <span role="presentation" onClick={handleClick} onKeyDown={undefined}>
        {child}
      </span>
    );
  }

  return (
    <button type="button" onClick={handleClick}>
      {children}
    </button>
  );
}

// ── DialogContent ───────────────────────────────────────
interface DialogContentProps {
  children: ReactNode;
  className?: string;
}

export function DialogContent({ children, className }: DialogContentProps) {
  const { open, setOpen } = useContext(DialogContext);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const timer = setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open, mounted]);

  // Close on Escape key
  useEffect(() => {
    if (!mounted) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mounted, setOpen]);

  // Prevent body scroll when open
  useEffect(() => {
    if (mounted) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: overlay click-to-close is intentional */}
      <div
        className={styles.overlay}
        data-overlay=""
        data-state={closing ? "closing" : "open"}
        onClick={() => setOpen(false)}
        onKeyDown={undefined}
        role="presentation"
      />
      <div
        className={`${styles.content} ${className ?? ""}`}
        data-state={closing ? "closing" : "open"}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

// ── DialogTitle ─────────────────────────────────────────
export function DialogTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <h2 className={`${styles.title} ${className ?? ""}`}>{children}</h2>;
}

// ── DialogDescription ───────────────────────────────────
export function DialogDescription({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`${styles.description} ${className ?? ""}`}>{children}</p>
  );
}

// ── DialogClose ─────────────────────────────────────────
export function DialogClose({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { setOpen } = useContext(DialogContext);

  return (
    <button
      type="button"
      className={`${styles.close} ${className ?? ""}`}
      onClick={() => setOpen(false)}
      aria-label="閉じる"
    >
      {children}
    </button>
  );
}
