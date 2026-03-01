"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./TagSelect.module.scss";

// ─── Types ───────────────────────────────────────────────

interface TagOption {
  id: string;
  name: string;
}

interface TagSelectProps {
  tags: TagOption[];
  value?: TagOption[];
  multiple?: boolean;
  onChange?: (selected: TagOption[]) => void;
  placeholder?: string;
}

// ─── TagSelect ───────────────────────────────────────────

export function TagSelect({
  tags,
  value,
  multiple = false,
  onChange,
  placeholder = "タグを選択",
}: TagSelectProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<TagOption[]>(value ?? []);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleSelect = useCallback(
    (tag: TagOption) => {
      const isSelected = selected.some((s) => s.id === tag.id);

      let next: TagOption[];
      if (isSelected) {
        next = selected.filter((s) => s.id !== tag.id);
      } else if (multiple) {
        next = [...selected, tag];
      } else {
        next = [tag];
      }

      setSelected(next);
      onChange?.(next);

      if (!multiple) {
        setOpen(false);
      }
    },
    [multiple, onChange, selected],
  );

  const displayText =
    selected.length > 0 ? selected.map((t) => t.name).join(", ") : null;

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        data-state={open ? "open" : "closed"}
        className={styles.trigger}
        onClick={() => setOpen(!open)}
      >
        {displayText && !open ? (
          <span className={styles.selectedDisplay}>{displayText}</span>
        ) : (
          <span className={styles.placeholder}>{placeholder}</span>
        )}
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

      {open && (
        <div className={styles.dropdown} role="listbox">
          {tags.map((tag) => {
            const isSelected = selected.some((s) => s.id === tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                role="option"
                className={styles.item}
                data-selected={isSelected ? "true" : undefined}
                aria-selected={isSelected}
                onClick={() => handleSelect(tag)}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
