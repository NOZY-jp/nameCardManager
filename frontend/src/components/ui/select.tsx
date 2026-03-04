"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./select.module.scss";

// ── Context ─────────────────────────────────────────────
interface SelectContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  value: string;
  onValueChange: (value: string) => void;
  selectedLabel: string;
  setSelectedLabel: (label: string) => void;
}

const SelectContext = createContext<SelectContextValue>({
  open: false,
  setOpen: () => {},
  value: "",
  onValueChange: () => {},
  selectedLabel: "",
  setSelectedLabel: () => {},
});

// ── Select (root) ───────────────────────────────────────
interface SelectProps {
  children: ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  resetOnSelect?: boolean;
}

export function Select({
  children,
  value: controlledValue,
  onValueChange,
  defaultValue = "",
  resetOnSelect = false,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [selectedLabel, setSelectedLabel] = useState("");

  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  const handleValueChange = useCallback(
    (newValue: string) => {
      if (!isControlled) {
        setInternalValue(newValue);
      }
      onValueChange?.(newValue);
      setOpen(false);
      if (resetOnSelect) {
        queueMicrotask(() => {
          setSelectedLabel("");
          if (!isControlled) {
            setInternalValue("");
          }
        });
      }
    },
    [isControlled, onValueChange, resetOnSelect],
  );

  const ctx = useMemo(
    () => ({
      open,
      setOpen,
      value,
      onValueChange: handleValueChange,
      selectedLabel,
      setSelectedLabel,
    }),
    [open, value, handleValueChange, selectedLabel],
  );

  return (
    <SelectContext.Provider value={ctx}>
      <div className={styles.selectWrapper}>{children}</div>
    </SelectContext.Provider>
  );
}

// ── SelectTrigger ───────────────────────────────────────
export function SelectTrigger({
  children,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  "aria-label"?: string;
}) {
  const { open, setOpen } = useContext(SelectContext);
  const ref = useRef<HTMLButtonElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;

    const handleClick = (e: MouseEvent) => {
      if (
        ref.current &&
        !ref.current
          .closest(`.${styles.selectWrapper}`)
          ?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, setOpen]);

  return (
    <button
      ref={ref}
      type="button"
      role="combobox"
      aria-expanded={open}
      aria-label={ariaLabel}
      data-state={open ? "open" : "closed"}
      className={styles.trigger}
      onClick={() => setOpen(!open)}
    >
      {children}
      <svg
        className={styles.triggerIcon}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

// ── SelectValue ─────────────────────────────────────────
export function SelectValue({ placeholder }: { placeholder?: string }) {
  const { selectedLabel, value } = useContext(SelectContext);

  const display = selectedLabel || value;

  if (!display) {
    return <span className={styles.placeholder}>{placeholder}</span>;
  }

  return <span>{display}</span>;
}

// ── SelectContent ───────────────────────────────────────
export function SelectContent({ children }: { children: ReactNode }) {
  const { open } = useContext(SelectContext);

  if (!open) return null;

  return (
    <div className={styles.content} role="listbox">
      {children}
    </div>
  );
}

// ── SelectItem ──────────────────────────────────────────
interface SelectItemProps {
  value: string;
  children: ReactNode;
  "aria-label"?: string;
}

export function SelectItem({
  value: itemValue,
  children,
  "aria-label": ariaLabel,
}: SelectItemProps) {
  const { value, onValueChange, setSelectedLabel } = useContext(SelectContext);
  const isSelected = value === itemValue;

  const handleClick = () => {
    onValueChange(itemValue);
    setSelectedLabel(typeof children === "string" ? children : itemValue);
  };

  return (
    <button
      type="button"
      role="option"
      className={styles.item}
      data-selected={isSelected ? "true" : undefined}
      aria-selected={isSelected}
      aria-label={ariaLabel}
      onClick={handleClick}
    >
      {children}
    </button>
  );
}
