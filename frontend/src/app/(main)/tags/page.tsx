"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TagList } from "@/components/tag/TagList";
import {
  getTags,
  createTag,
  updateTag,
  deleteTag,
  type Tag,
} from "@/lib/api/tags";
import styles from "./tags.module.scss";

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTags();
      setTags(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleAdd = async (data: { name: string }) => {
    await createTag(data);
    fetchTags();
  };

  const handleUpdate = async (data: { id: string; name: string }) => {
    await updateTag(data.id, { name: data.name });
    fetchTags();
  };

  const handleDelete = async (id: string) => {
    await deleteTag(id);
    fetchTags();
  };

  return (
    <div className={styles.page}>
      <Card>
        <CardHeader>
          <CardTitle>タグ管理</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className={styles.loading}>読み込み中...</p>
          ) : (
            <TagList
              tags={tags}
              onAdd={handleAdd}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
