"use client";

import { ArrowDownAZ, ArrowUpAZ } from "lucide-react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { NameCardList } from "@/components/namecard";
import { getNameCards, type NameCard } from "@/lib/api/namecards";
import { searchNameCards } from "@/lib/api/search";
import styles from "./namecards.module.scss";

type SortField = "updated_at" | "last_name" | "created_at";
type SortOrder = "asc" | "desc";

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "updated_at", label: "最終更新日" },
  { value: "last_name", label: "名前" },
  { value: "created_at", label: "作成日" },
];

function NameCardsContent() {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("search") ?? "";

  const [items, setItems] = useState<NameCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortField>("updated_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const perPage = 20;

  const fetchCards = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        if (searchQuery.trim()) {
          const res = await searchNameCards({
            q: searchQuery.trim(),
            page: p,
            per_page: perPage,
          });
          setItems(res.items);
          setTotal(res.total);
        } else {
          const res = await getNameCards({
            page: p,
            per_page: perPage,
            sort_by: sortBy,
            sort_order: sortOrder,
          });
          setItems(res.items);
          setTotal(res.total);
        }
      } finally {
        setLoading(false);
      }
    },
    [searchQuery, sortBy, sortOrder],
  );

  useEffect(() => {
    setPage(1);
  }, [searchQuery, sortBy, sortOrder]);

  useEffect(() => {
    fetchCards(page);
  }, [page, fetchCards]);

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  return (
    <div className={styles.page}>
      <div className={styles.toolbar} data-testid="sort-toolbar">
        <div className={styles.sortGroup}>
          <span className={styles.sortLabel}>並び替え:</span>
          <select
            className={styles.sortSelect}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortField)}
            aria-label="ソート項目"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.sortOrderButton}
            onClick={toggleSortOrder}
            aria-label={sortOrder === "asc" ? "昇順" : "降順"}
            title={sortOrder === "asc" ? "昇順" : "降順"}
          >
            {sortOrder === "asc" ? (
              <ArrowUpAZ size={18} />
            ) : (
              <ArrowDownAZ size={18} />
            )}
          </button>
        </div>
        {searchQuery && (
          <span className={styles.searchInfo}>
            「{searchQuery}」の検索結果: {total}件
          </span>
        )}
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
