"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RelationshipTree } from "@/components/relationship/RelationshipTree";
import type { RelationshipTreeNode } from "@/components/relationship/RelationshipTree";
import {
  getRelationships,
  createRelationship,
  updateRelationship,
  deleteRelationship,
} from "@/lib/api/relationships";
import styles from "./relationships.module.scss";

export default function RelationshipsPage() {
  const [tree, setTree] = useState<RelationshipTreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRelationships();
      setTree(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const handleAdd = async (data: { name: string; parent_id: string }) => {
    await createRelationship({
      name: data.name,
      parent_id: data.parent_id === "root" ? null : data.parent_id,
    });
    fetchTree();
  };

  const handleUpdate = async (data: { id: string; name: string }) => {
    await updateRelationship(data.id, { name: data.name });
    fetchTree();
  };

  const handleDelete = async (id: string) => {
    await deleteRelationship(id);
    fetchTree();
  };

  return (
    <div className={styles.page}>
      <Card>
        <CardHeader>
          <CardTitle>所属・関係性管理</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className={styles.loading}>読み込み中...</p>
          ) : (
            <RelationshipTree
              tree={tree}
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
