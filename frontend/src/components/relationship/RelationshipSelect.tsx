"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./RelationshipSelect.module.scss";

// ─── Types ───────────────────────────────────────────────

interface RelationshipNode {
  id: string;
  node_name: string;
  parent_id?: string | null;
  full_path?: string;
  children?: RelationshipNode[];
}

interface RelationshipSelectProps {
  tree: RelationshipNode[];
  value?: string | string[];
  multiple?: boolean;
  onChange?: (node: RelationshipNode & { full_path: string }) => void;
  placeholder?: string;
}

// ─── Helpers ─────────────────────────────────────────────

function buildFullPath(
  node: RelationshipNode,
  tree: RelationshipNode[],
): string {
  if (node.full_path) return node.full_path;

  const path: string[] = [];

  function findPath(nodes: RelationshipNode[], target: string): boolean {
    for (const n of nodes) {
      path.push(n.node_name);
      if (n.id === target) return true;
      if (n.children?.length && findPath(n.children, target)) return true;
      path.pop();
    }
    return false;
  }

  findPath(tree, node.id);
  return path.join("/");
}

function findNodeById(
  nodes: RelationshipNode[],
  id: string,
): RelationshipNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children?.length) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

// ─── TreeNode ────────────────────────────────────────────

function TreeNode({
  node,
  tree,
  selectedIds,
  expandedIds,
  onToggleExpand,
  onSelect,
}: {
  node: RelationshipNode;
  tree: RelationshipNode[];
  selectedIds: Set<string>;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelect: (node: RelationshipNode) => void;
}) {
  const hasChildren = Boolean(node.children?.length);
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedIds.has(node.id);

  return (
    <div className={styles.treeNode}>
      <div className={styles.nodeRow}>
        {hasChildren ? (
          <button
            type="button"
            className={styles.expandButton}
            aria-label={node.node_name}
            onClick={() => onToggleExpand(node.id)}
          >
            <svg
              className={styles.expandIcon}
              data-expanded={isExpanded ? "true" : undefined}
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        ) : (
          <span className={styles.expandSpacer} />
        )}
        <span
          role="option"
          className={styles.nodeLabel}
          data-selected={isSelected ? "true" : undefined}
          aria-selected={isSelected}
          onClick={() => onSelect(node)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onSelect(node);
          }}
          tabIndex={0}
        >
          {node.node_name}
        </span>
      </div>
      {hasChildren && isExpanded && (
        <div className={styles.children}>
          {node.children?.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              tree={tree}
              selectedIds={selectedIds}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── RelationshipSelect ──────────────────────────────────

export function RelationshipSelect({
  tree,
  value,
  multiple = false,
  onChange,
  placeholder = "所属を選択",
}: RelationshipSelectProps) {
  const [open, setOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (!value) return new Set();
    if (Array.isArray(value)) return new Set(value);
    return new Set([value]);
  });
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback(
    (node: RelationshipNode) => {
      const fullPath = buildFullPath(node, tree);
      const enrichedNode = { ...node, full_path: fullPath };

      if (multiple) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(node.id)) {
            next.delete(node.id);
          } else {
            next.add(node.id);
          }
          return next;
        });
      } else {
        setSelectedIds(new Set([node.id]));
        setOpen(false);
      }

      onChange?.(enrichedNode);
    },
    [multiple, onChange, tree],
  );

  // Build display text
  const displayText = (() => {
    if (selectedIds.size === 0) return null;

    const labels: string[] = [];
    for (const id of selectedIds) {
      const node = findNodeById(tree, id);
      if (node) {
        labels.push(buildFullPath(node, tree));
      }
    }
    return labels;
  })();

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        data-state={open ? "open" : "closed"}
        className={styles.trigger}
        onClick={() => setOpen(!open)}
      >
        {displayText && displayText.length > 0 ? (
          <span className={styles.selectedDisplay}>
            {displayText.map((label) => (
              <span key={label} className={styles.selectedText}>
                {label}
              </span>
            ))}
          </span>
        ) : (
          <span className={styles.placeholder}>{placeholder}</span>
        )}
        <svg
          className={styles.triggerIcon}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className={styles.dropdown} role="listbox">
          {tree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              tree={tree}
              selectedIds={selectedIds}
              expandedIds={expandedIds}
              onToggleExpand={handleToggleExpand}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
