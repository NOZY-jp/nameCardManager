"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "./TagList.module.scss";

interface TagItem {
  id: string;
  name: string;
}

interface TagListProps {
  tags: TagItem[];
  onAdd?: (data: { name: string }) => void;
  onDelete?: (id: string) => void;
  onUpdate?: (data: { id: string; name: string }) => void;
}

function TagListItem({
  tag,
  onDelete,
  onUpdate,
}: {
  tag: TagItem;
  onDelete?: (id: string) => void;
  onUpdate?: (data: { id: string; name: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(tag.name);
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus();
    }
  }, [editing]);

  const handleDoubleClick = () => {
    setEditing(true);
    setEditValue(tag.name);
  };

  const commitEdit = () => {
    if (editValue.trim() && editValue !== tag.name) {
      onUpdate?.({ id: tag.id, name: editValue.trim() });
    }
    setEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitEdit();
    }
    if (e.key === "Escape") {
      setEditing(false);
      setEditValue(tag.name);
    }
  };

  return (
    <div className={styles.tagItem} data-testid={`tag-${tag.id}`}>
      {editing ? (
        <input
          ref={editRef}
          className={styles.editInput}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleEditKeyDown}
          onBlur={commitEdit}
        />
      ) : (
        // biome-ignore lint/a11y/noStaticElementInteractions: dblClick for inline edit UX
        <span className={styles.tagName} onDoubleClick={handleDoubleClick}>
          {tag.name}
        </span>
      )}
      {onDelete && (
        <button
          type="button"
          className={styles.deleteButton}
          onClick={() => onDelete(tag.id)}
          aria-label="削除"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

export function TagList({ tags, onAdd, onDelete, onUpdate }: TagListProps) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");

  const handleAdd = () => {
    if (!newName.trim()) {
      setError("タグ名を入力してください");
      return;
    }
    setError("");
    onAdd?.({ name: newName.trim() });
    setNewName("");
  };

  if (tags.length === 0 && !onAdd) {
    return (
      <div className={styles.container}>
        <p className={styles.emptyState}>タグがありません</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {tags.length === 0 ? (
        <p className={styles.emptyState}>タグがありません</p>
      ) : (
        <div className={styles.tagGrid}>
          {tags.map((tag) => (
            <TagListItem
              key={tag.id}
              tag={tag}
              onDelete={onDelete}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}

      {onAdd && (
        <div className={styles.addSection}>
          <div className={styles.addRow}>
            <input
              className={styles.addInput}
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (error) setError("");
              }}
              placeholder="新しいタグ名"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <button
              type="button"
              className={styles.addButton}
              onClick={handleAdd}
              aria-label="追加"
            >
              <Plus size={16} />
              追加
            </button>
          </div>
          {error && <span className={styles.errorMessage}>{error}</span>}
        </div>
      )}
    </div>
  );
}
