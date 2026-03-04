"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { NameCardList } from "@/components/namecard";
import {
  getNameCards,
  type GetNameCardsParams,
  type NameCard,
} from "@/lib/api/namecards";
import { searchNameCards } from "@/lib/api/search";
import styles from "./namecards.module.scss";

type SortOption = {
  label: string;
  sort_by: string;
  sort_order: "asc" | "desc";
};

const SORT_OPTIONS: SortOption[] = [
  { label: "作成日（新しい順）", sort_by: "created_at", sort_order: "desc" },
  { label: "作成日（古い順）", sort_by: "created_at", sort_order: "asc" },
  { label: "更新日（新しい順）", sort_by: "updated_at", sort_order: "desc" },
  { label: "更新日（古い順）", sort_by: "updated_at", sort_order: "asc" },
  { label: "名前（昇順）", sort_by: "last_name", sort_order: "asc" },
  { label: "名前（降順）", sort_by: "last_name", sort_order: "desc" },
  { label: "かな（昇順）", sort_by: "last_name_kana", sort_order: "asc" },
  { label: "かな（降順）", sort_by: "last_name_kana", sort_order: "desc" },
];

function NameCardsContent() {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("search") || "";

  const [items, setItems] = useState<NameCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortIndex, setSortIndex] = useState(0);
  const prevSearchRef = useRef(searchQuery);
  const perPage = 20;

  const fetchCards = useCallback(
    async (p: number, si: number, query: string) => {
      setLoading(true);
      try {
        const { sort_by, sort_order } = SORT_OPTIONS[si];
        if (query.trim()) {
          const res = await searchNameCards({
            q: query.trim(),
            page: p,
            per_page: perPage,
          });
          setItems(res.items);
          setTotal(res.total);
        } else {
          const res = await getNameCards({
            page: p,
            per_page: perPage,
            sort_by: sort_by as GetNameCardsParams["sort_by"],
            sort_order,
          });
          setItems(res.items);
          setTotal(res.total);
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (prevSearchRef.current !== searchQuery) {
      prevSearchRef.current = searchQuery;
      setPage(1);
      return;
    }
    fetchCards(page, sortIndex, searchQuery);
  }, [page, sortIndex, searchQuery, fetchCards]);

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = Number(e.target.value);
    setSortIndex(idx);
    setPage(1);
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        {searchQuery && (
          <p className={styles.searchInfo}>
            「{searchQuery}」の検索結果（{total}件）
          </p>
        )}
        <div className={styles.sortControl}>
          <label htmlFor="sort-select" className={styles.sortLabel}>
            並び替え
          </label>
          <select
            id="sort-select"
            className={styles.sortSelect}
            value={sortIndex}
            onChange={handleSortChange}
            aria-label="並び替え"
          >
            {SORT_OPTIONS.map((opt, i) => (
              <option key={`${opt.sort_by}-${opt.sort_order}`} value={i}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <NameCardList
        items={items}
        total={total}
        page={page}
        perPage={perPage}
        onPageChange={setPage}
        loading={loading}
      />
    </div>
  );
}

export default function NameCardsPage() {
  return (
    <Suspense>
      <NameCardsContent />
    </Suspense>
  );
}
