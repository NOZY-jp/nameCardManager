"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NameCardDetail, NameCardEditDialog } from "@/components/namecard";
import {
  deleteNameCard,
  getNameCard,
  type NameCard,
  updateNameCard,
} from "@/lib/api/namecards";
import type { NamecardCreateFormData } from "@/lib/schemas/namecard";

export default function NameCardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const isNumericId = /^\d+$/.test(id);

  const [card, setCard] = useState<NameCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const fetchCard = useCallback(async () => {
    if (!isNumericId) return;
    setLoading(true);
    try {
      const data = await getNameCard(id);
      setCard(data);
    } finally {
      setLoading(false);
    }
  }, [id, isNumericId]);

  useEffect(() => {
    fetchCard();
  }, [fetchCard]);

  if (!isNumericId) {
    notFound();
  }

  const handleSave = async (data: NamecardCreateFormData) => {
    await updateNameCard(id, data);
    setEditOpen(false);
    await fetchCard();
  };

  const handleDelete = async () => {
    await deleteNameCard(id);
    router.push("/namecards");
  };

  if (loading || !card) {
    return <div>読み込み中...</div>;
  }

  return (
    <>
      <NameCardDetail
        card={card}
        onEdit={() => setEditOpen(true)}
        onDelete={handleDelete}
      />
      <NameCardEditDialog
        card={card}
        open={editOpen}
        onSave={handleSave}
        onClose={() => setEditOpen(false)}
      />
    </>
  );
}
