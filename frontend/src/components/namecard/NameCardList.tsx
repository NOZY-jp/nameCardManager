"use client";

import { useMemo } from "react";
import { Inbox } from "lucide-react";
import type { NameCard } from "@/lib/api/namecards";
import { NameCardItem } from "./NameCardItem";
import styles from "./NameCardList.module.scss";

interface NameCardListProps {
  items?: NameCard[];
  total?: number;
  page?: number;
  perPage?: number;
  onPageChange?: (page: number) => void;
  loading?: boolean;
}

export function NameCardList({
  items = [],
  total = 0,
  page = 1,
  perPage = 20,
  onPageChange,
  loading = false,
}: NameCardListProps) {
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / perPage)),
    [total, perPage],
  );

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.list}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`skeleton-${i.toString()}`}
              className={styles.skeleton}
              data-testid="namecard-skeleton"
            >
              <div className={styles.skeletonThumb} />
              <div className={styles.skeletonBody}>
                <div className={styles.skeletonLine} />
                <div className={styles.skeletonLine} />
                <div className={styles.skeletonLine} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <Inbox className={styles.emptyIcon} />
          <span className={styles.emptyText}>名刺がありません</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <ul className={styles.list}>
        {items.map((card) => (
          <NameCardItem key={card.id} card={card} />
        ))}
      </ul>

      {totalPages > 1 && (
        <nav className={styles.pagination} aria-label="ページネーション">
          <button
            type="button"
            className={styles.pageButton}
            disabled={page <= 1}
            onClick={() => onPageChange?.(page - 1)}
            aria-label="前のページ"
          >
            ‹
          </button>

          {Array.from({ length: totalPages }).map((_, i) => {
            const pageNum = i + 1;
            return (
              <button
                key={pageNum}
                type="button"
                className={styles.pageButton}
                data-active={pageNum === page ? "true" : undefined}
                onClick={() => onPageChange?.(pageNum)}
                aria-label={`ページ ${pageNum}`}
                aria-current={pageNum === page ? "page" : undefined}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            type="button"
            className={styles.pageButton}
            disabled={page >= totalPages}
            onClick={() => onPageChange?.(page + 1)}
            aria-label="次のページ"
          >
            ›
          </button>
        </nav>
      )}
    </div>
  );
}
