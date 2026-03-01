"use client";

import { Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./SearchBar.module.scss";

interface SearchBarProps {
  onSearch: (query: string) => void;
  debounce?: number;
  placeholder?: string;
}

export function SearchBar({
  onSearch,
  debounce = 300,
  placeholder = "名刺を検索...",
}: SearchBarProps) {
  const [value, setValue] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fireSearch = useCallback(
    (query: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        onSearch(query);
      }, debounce);
    },
    [onSearch, debounce],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setValue(next);
    fireSearch(next);
  };

  const handleClear = () => {
    setValue("");
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onSearch("");
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div className={styles.searchBar}>
      <Search className={styles.searchIcon} size={18} />
      <input
        type="search"
        className={styles.input}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label="検索"
      />
      {value && (
        <button
          type="button"
          className={styles.clearButton}
          onClick={handleClear}
          aria-label="クリア"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
