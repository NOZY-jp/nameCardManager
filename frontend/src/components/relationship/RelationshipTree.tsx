"use client";

import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "./RelationshipTree.module.scss";

// ─── Types ───────────────────────────────────────────────

export interface RelationshipTreeNode {
  id: string;
  node_name: string;
  parent_id: string | null;
  children: RelationshipTreeNode[];
}

interface RelationshipTreeProps {
  tree: RelationshipTreeNode[];
  onAdd?: (data: { name: string; parent_id: string }) => void;
  onDelete?: (id: string) => void;
  onUpdate?: (data: { id: string; name: string }) => void;
}

// ─── Tree Node ───────────────────────────────────────────

interface TreeNodeProps {
  node: RelationshipTreeNode;
  depth: number;
  onDelete?: (id: string) => void;
  onUpdate?: (data: { id: string; name: string }) => void;
}

function TreeNode({ node, depth, onDelete, onUpdate }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.node_name);
  const editInputRef = useRef<HTMLInputElement>(null);
  const hasChildren = node.children.length > 0;
  const isLeaf = !hasChildren;

  useEffect(() => {
    if (editing && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editing]);

  const handleToggle = () => {
    setExpanded((prev) => !prev);
  };

  const handleDoubleClick = () => {
    setEditing(true);
    setEditValue(node.node_name);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (editValue.trim() && editValue !== node.node_name) {
        onUpdate?.({ id: node.id, name: editValue.trim() });
      }
      setEditing(false);
    }
    if (e.key === "Escape") {
      setEditing(false);
      setEditValue(node.node_name);
    }
  };

  const handleEditBlur = () => {
    if (editValue.trim() && editValue !== node.node_name) {
      onUpdate?.({ id: node.id, name: editValue.trim() });
    }
    setEditing(false);
  };

  return (
    <div data-testid={`tree-node-${node.id}`}>
      <div
        className={styles.nodeRow}
        style={{ paddingLeft: `${depth * 1.25}rem` }}
      >
        <button
          type="button"
          className={styles.nodeToggle}
          onClick={handleToggle}
          aria-label={node.node_name}
          aria-expanded={expanded}
        >
          <ChevronRight
            size={14}
            className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ""}`}
            style={{ visibility: hasChildren ? "visible" : "hidden" }}
          />
          {editing ? (
            <input
              ref={editInputRef}
              className={styles.editInput}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleEditKeyDown}
              onBlur={handleEditBlur}
            />
          ) : (
            // biome-ignore lint/a11y/noStaticElementInteractions: dblClick for inline edit UX
            <span className={styles.nodeName} onDoubleClick={handleDoubleClick}>
              {node.node_name}
            </span>
          )}
        </button>

        <div className={styles.nodeActions}>
          {isLeaf && onDelete && (
            <button
              type="button"
              className={styles.deleteButton}
              onClick={() => onDelete(node.id)}
              aria-label="削除"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {expanded && hasChildren && (
        <div className={styles.childrenContainer}>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onDelete={onDelete}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add Form ────────────────────────────────────────────

interface AddFormProps {
  onAdd: (data: { name: string; parent_id: string }) => void;
}

function AddForm({ onAdd }: AddFormProps) {
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), parent_id: "root" });
    setName("");
    setShow(false);
  };

  if (!show) {
    return (
      <button
        type="button"
        className={styles.addButton}
        onClick={() => setShow(true)}
        aria-label="追加"
      >
        <Plus size={16} />
        追加
      </button>
    );
  }

  return (
    <div className={styles.addForm}>
      <input
        className={styles.addInput}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="ノード名"
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
      />
      <button
        type="button"
        className={styles.confirmButton}
        onClick={handleSubmit}
        aria-label="追加"
      >
        追加
      </button>
      <button
        type="button"
        className={styles.cancelButton}
        onClick={() => {
          setShow(false);
          setName("");
        }}
      >
        キャンセル
      </button>
    </div>
  );
}

// ─── RelationshipTree ────────────────────────────────────

export function RelationshipTree({
  tree,
  onAdd,
  onDelete,
  onUpdate,
}: RelationshipTreeProps) {
  if (tree.length === 0) {
    return (
      <div className={styles.container}>
        <p className={styles.emptyState}>所属・関係性がありません</p>
        {onAdd && <AddForm onAdd={onAdd} />}
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.tree}>
        {tree.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
        ))}
      </div>
      {onAdd && <AddForm onAdd={onAdd} />}
    </div>
  );
}
