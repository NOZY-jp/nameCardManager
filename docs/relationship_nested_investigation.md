# 調査レポート: 入れ子構造の関係性登録

## 1. 現象

関係性（Relationship）管理ページにおいて、**入れ子構造（親子関係）を持つノードを登録する手段がない**。

現在のUIでは「追加」ボタンで新規ノードを作成できるが、すべてのノードがルートレベル（`parent_id: null`）として作成される。例えば「建築士会 / 桑名支部 / 青年会長」のような階層構造を構築することができない。

バックエンド API は `parent_id` を指定した子ノード作成に対応しているため、**問題はフロントエンドに限定される**。

---

## 2. 現在の実装の調査結果

### 2.1 フロントエンド

#### `frontend/src/app/(main)/relationships/page.tsx`

- `handleAdd` は `data.parent_id` が `"root"` なら `null` に変換してAPIに送信（L33-39）
- `RelationshipTree` に `onAdd` コールバックを渡している
- **`handleAdd` 自体は任意の `parent_id` を受け取れる設計になっている**

```typescript
const handleAdd = async (data: { name: string; parent_id: string }) => {
  await createRelationship({
    name: data.name,
    parent_id: data.parent_id === "root" ? null : data.parent_id,
  });
  fetchTree();
};
```

#### `frontend/src/components/relationship/RelationshipTree.tsx` — `AddForm`

- `parent_id` を常に `"root"` としてハードコード（L153）
- 親ノードを選択する手段が存在しない

```typescript
// L151-156
const handleSubmit = () => {
  if (!name.trim()) return;
  onAdd({ name: name.trim(), parent_id: "root" });  // ← 常に "root"
  setName("");
  setShow(false);
};
```

#### `frontend/src/components/relationship/RelationshipTree.tsx` — `TreeNode`

- `TreeNodeProps` に `onAdd` コールバックが定義されていない（L25-30）
- 各ノードに「子を追加」するボタンやUIが存在しない
- `TreeNode` は `onDelete` と `onUpdate` のみを伝播する

```typescript
interface TreeNodeProps {
  node: RelationshipTreeNode;
  depth: number;
  onDelete?: (id: string) => void;
  onUpdate?: (data: { id: string; name: string }) => void;
  // onAdd がない
}
```

#### `frontend/src/components/relationship/RelationshipTree.tsx` — `RelationshipTree`

- ツリーの最下部に `AddForm` を1つだけ配置（L233）
- 各 `TreeNode` に `onAdd` を渡していない（L224-231）

### 2.2 バックエンド

#### `backend/app/api/v1/endpoints/relationships.py` — `POST /relationships`

- `parent_id` を受け取り、指定された親ノードの子として作成可能（L146-182）
- `parent_id` のバリデーション（存在確認、所有者確認）も実装済み
- **バックエンドに修正は不要**

#### `backend/app/models/__init__.py` — `Relationship` モデル

- `parent_id` カラムにより自己参照の親子関係をサポート（L60-62）
- `children` リレーションで子ノードの取得が可能（L74-77）
- `get_ancestors()`, `get_descendants()`, `get_full_path()` などの階層操作メソッドも実装済み
- **モデルに修正は不要**

#### `backend/app/schemas/__init__.py` — `RelationshipCreate`

- `parent_id: int | None = None` で子ノード作成に対応済み（L104-105）
- **スキーマに修正は不要**

### 2.3 フロントエンド API クライアント

#### `frontend/src/lib/api/relationships.ts`

- `createRelationship` は `parent_id: string | null` を送信可能（L12-15, L28-36）
- **API クライアントに修正は不要**

---

## 3. 根本原因

**親ノードを指定して子ノードを追加するUIが存在しない。**

具体的には以下の3点:

1. **`AddForm` が `parent_id: "root"` をハードコード** — どのノードの子として追加するかを指定する手段がない
2. **`TreeNode` に `onAdd` コールバックが存在しない** — 各ノードに「子を追加」機能を持たせられない
3. **`TreeNode` に「子を追加」ボタンが存在しない** — ユーザーが特定ノード配下に子を追加するUI要素がない

バックエンドは `parent_id` を受け取る設計が完了しており、問題はフロントエンドのUIレイヤーのみ。

---

## 4. 修正案

### 4.1 方針

各 `TreeNode` に「＋」ボタン（子を追加）を配置し、クリックするとそのノード直下にインライン `AddForm` を表示する。既存のルートレベル `AddForm` はそのまま残す。

### 4.2 修正対象ファイル一覧

| # | ファイル | 修正内容 |
|---|---------|---------|
| 1 | `frontend/src/components/relationship/RelationshipTree.tsx` | `TreeNodeProps` に `onAdd` を追加、「子を追加」ボタンとインライン `AddForm` を `TreeNode` 内に追加 |
| 2 | `frontend/src/components/relationship/RelationshipTree.module.scss` | 「子を追加」ボタン用のスタイルを追加 |
| 3 | `frontend/src/__tests__/components/relationship/RelationshipTree.test.tsx` | 子ノード追加のテストケースを追加 |

**バックエンド（API・モデル・スキーマ）は修正不要。**

### 4.3 コード修正例

#### 4.3.1 `TreeNodeProps` に `onAdd` を追加

```typescript
interface TreeNodeProps {
  node: RelationshipTreeNode;
  depth: number;
  onAdd?: (data: { name: string; parent_id: string }) => void;    // 追加
  onDelete?: (id: string) => void;
  onUpdate?: (data: { id: string; name: string }) => void;
}
```

#### 4.3.2 `TreeNode` に「子を追加」ボタンとインライン AddForm を追加

```typescript
function TreeNode({ node, depth, onAdd, onDelete, onUpdate }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.name);
  const [addingChild, setAddingChild] = useState(false);     // 追加
  const [childName, setChildName] = useState("");             // 追加
  const editInputRef = useRef<HTMLInputElement>(null);
  const childInputRef = useRef<HTMLInputElement>(null);       // 追加
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isLeaf = !hasChildren;

  // ... 既存のuseEffect・ハンドラ ...

  // ── 子追加ハンドラ（追加）──
  const handleAddChild = () => {
    if (!childName.trim()) return;
    onAdd?.({ name: childName.trim(), parent_id: String(node.id) });
    setChildName("");
    setAddingChild(false);
    setExpanded(true);  // 追加後に子ノードを展開
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
          aria-label={node.name}
          aria-expanded={expanded}
        >
          {/* ... 既存のChevron・名前表示 ... */}
        </button>

        <div className={styles.nodeActions}>
          {/* ── 子を追加ボタン（追加）── */}
          {onAdd && (
            <button
              type="button"
              className={styles.addChildButton}
              onClick={() => setAddingChild(true)}
              aria-label="子を追加"
            >
              <Plus size={14} />
            </button>
          )}
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

      {/* ── インライン子追加フォーム（追加）── */}
      {addingChild && (
        <div
          className={styles.addForm}
          style={{ paddingLeft: `${(depth + 1) * 1.25}rem` }}
        >
          <input
            ref={childInputRef}
            className={styles.addInput}
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="子ノード名"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddChild();
              if (e.key === "Escape") {
                setAddingChild(false);
                setChildName("");
              }
            }}
          />
          <button
            type="button"
            className={styles.confirmButton}
            onClick={handleAddChild}
            aria-label="追加"
          >
            追加
          </button>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={() => {
              setAddingChild(false);
              setChildName("");
            }}
          >
            キャンセル
          </button>
        </div>
      )}

      {expanded && hasChildren && (
        <div className={styles.childrenContainer}>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onAdd={onAdd}          {/* onAdd を子に伝播 */}
              onDelete={onDelete}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

#### 4.3.3 `RelationshipTree` から `TreeNode` に `onAdd` を渡す

```typescript
export function RelationshipTree({
  tree,
  onAdd,
  onDelete,
  onUpdate,
}: RelationshipTreeProps) {
  // ... 空の場合の処理は変更なし ...

  return (
    <div className={styles.container}>
      <div className={styles.tree}>
        {tree.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            onAdd={onAdd}          {/* onAdd を追加 */}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
        ))}
      </div>
      {onAdd && <AddForm onAdd={onAdd} />}
    </div>
  );
}
```

#### 4.3.4 `RelationshipTree.module.scss` にスタイル追加

```scss
.addChildButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: $radius-sm;
  color: var(--color-foreground-muted);
  transition: background-color $transition-fast, color $transition-fast;

  &:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-primary);
  }
}
```

#### 4.3.5 `childInputRef` の自動フォーカス

既存の `useEffect` に `childInputRef` 用の処理を追加:

```typescript
useEffect(() => {
  if (addingChild && childInputRef.current) {
    childInputRef.current.focus();
  }
}, [addingChild]);
```

---

## 5. 修正工数の見積もり

| 作業 | 見積もり |
|------|---------|
| `TreeNodeProps` 修正 + `onAdd` コールバック伝播 | 15分 |
| `TreeNode` に「子を追加」ボタン＋インラインフォーム追加 | 30分 |
| `RelationshipTree` から `onAdd` を `TreeNode` に渡す | 5分 |
| SCSS スタイル追加 | 10分 |
| テストケース追加・修正 | 30分 |
| 動作確認（手動テスト） | 15分 |
| **合計** | **約1.5〜2時間** |

**難易度: Quick〜Short**（バックエンド修正不要、フロントエンドUIの変更のみ）
