"use client";

import { useCallback, useEffect, useState } from "react";
import { getNameCards, type NameCard } from "@/lib/api/namecards";
import { NameCardList } from "@/components/namecard";

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
    <NameCardList
      items={items}
      total={total}
      page={page}
      perPage={perPage}
      onPageChange={setPage}
      loading={loading}
    />
  );
}
