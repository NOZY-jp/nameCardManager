"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NameCardDetail, NameCardEditDialog } from "@/components/namecard";
import {
  addNameCardImage,
  deleteNameCard,
  deleteNameCardImage,
  getNameCard,
  type NameCard,
  updateNameCard,
} from "@/lib/api/namecards";
import { getRelationships } from "@/lib/api/relationships";
import { getTags } from "@/lib/api/tags";
import type { NamecardCreateFormData } from "@/lib/schemas/namecard";

export default function NameCardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const isNumericId = /^\d+$/.test(id);

  const [card, setCard] = useState<NameCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [relationships, setRelationships] = useState<
    Array<{
      id: string;
      name: string;
      parent_id?: string | null;
      children?: Array<{
        id: string;
        name: string;
        parent_id?: string | null;
      }>;
    }>
  >([]);
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([]);

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

  useEffect(() => {
    Promise.all([getRelationships(), getTags()])
      .then(([rels, tgs]) => {
        setRelationships(rels);
        setTags(tgs);
      })
      .catch(() => {
        // Options are optional; edit still works without them
      });
  }, []);

  if (!isNumericId) {
    notFound();
  }

  const handleSave = async (data: NamecardCreateFormData) => {
    const existingImages = card?.images ?? [];
    const submittedPaths = data.image_paths ?? [];
    const existingPaths = existingImages.map((img) => img.image_path);

    const pathsToDelete = existingImages.filter(
      (img) => !submittedPaths.includes(img.image_path),
    );
    const pathsToAdd = submittedPaths.filter(
      (path) => !existingPaths.includes(path),
    );

    for (const img of pathsToDelete) {
      await deleteNameCardImage(id, img.id);
    }
    for (const path of pathsToAdd) {
      await addNameCardImage(id, path);
    }

    const { image_paths: _ip, image_path: _ipath, ...scalarData } = data;
    await updateNameCard(id, scalarData);

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
        relationships={relationships}
        tags={tags}
      />
    </>
  );
}
