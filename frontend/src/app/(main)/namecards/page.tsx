"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NameCardList } from "@/components/namecard";
import { getNameCards, type NameCard } from "@/lib/api/namecards";
import styles from "./namecards.module.scss";

export default function NameCardsPage() {
  const [items, setItems] = useState<NameCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const perPage = 20;

  const fetchCards = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await getNameCards({ page: p, per_page: perPage });
      setItems(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCards(page);
  }, [page, fetchCards]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>名刺一覧</h1>
        <Link href="/namecards/new" className={styles.newButton}>
          <Plus size={18} />
          新規登録
        </Link>
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
