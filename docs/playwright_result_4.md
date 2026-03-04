# 検索バー・ソート機能 調査レポート

## 調査情報
- 日時: 2026-03-04
- 調査者: Sisyphus-Junior Agent
- 対象: 検索バーのヘッダー統合状況、検索結果ページ、ソート機能の有無
- 方法: コード調査 + Playwright UI検証

---

## 1. 調査結果サマリー

| 項目 | 状態 | 詳細 |
|------|------|------|
| ヘッダーの検索バー | ❌ 存在しない | `Header.tsx` に検索関連の実装なし |
| `SearchBar` コンポーネント | ⚠️ 実装済み・未使用 | `components/search/SearchBar.tsx` が存在するがどこからも使われていない |
| 検索結果ページ | ❌ 存在しない | 検索結果を表示する専用ページ・UIなし |
| ソートUI | ❌ 存在しない | `/namecards` ページにソートコントロールなし |
| バックエンド ソートAPI | ✅ 実装済み | `/api/v1/namecards` が `sort_by`, `order` パラメータ対応 |
| バックエンド 検索API | ✅ 実装済み | `/api/v1/search` が `q` パラメータで pg_bigm 全文検索対応 |
| フロントエンド 検索API関数 | ❌ 存在しない | `/api/v1/search` エンドポイントに対応するAPI関数なし |

---

## 2. ヘッダーに検索バーが存在しない問題

### 現状

**ファイル**: `frontend/src/components/layout/Header.tsx`（全221行）

ヘッダーの構成:

```
Header.tsx
├── ブランドリンク「名刺管理」 → /namecards
├── デスクトップナビ (.desktopNav)
│   ├── 「組織管理」リンク
│   ├── 「タグ管理」リンク
│   ├── 「エクスポート/インポート」リンク
│   ├── 「ヘルプ」リンク
│   └── 「＋」新規登録ボタン
├── テーマ切替ボタン
├── ログアウトボタン
└── モバイルハンバーガーメニュー
```

- **L1-10**: インポート文 — `SearchBar` のインポートなし
- **L12-45**: `NAV_ITEMS` 定義 — 検索関連なし
- **L46-220**: コンポーネント本体 — 検索UIなし

### 未使用の SearchBar コンポーネント

**ファイル**: `frontend/src/components/search/SearchBar.tsx`（全79行）

| 行番号 | 内容 |
|--------|------|
| L1-5 | React, useState, useCallback, lucide-react (Search, X) インポート |
| L7-11 | Props定義: `onSearch`, `placeholder`, `initialValue`, `className` |
| L13-55 | 本体: デバウンス付き検索（300ms）、クリアボタン、`onSearch` コールバック |
| L57-79 | JSX: 入力フィールド + 検索アイコン + クリアボタン |

**ファイル**: `frontend/src/components/search/SearchBar.module.scss`（全69行）

- 完全なスタイル定義済み（コンテナ、入力、アイコン、クリアボタン）
- **Tailwind CSS 不使用** — CSS Modules で実装

**使用状況**:

| ファイル | 用途 |
|----------|------|
| `frontend/src/__tests__/components/search/SearchBar.test.tsx` | テストファイル（唯一のインポート元） |
| その他のページ・レイアウト | **一切使用なし** |

---

## 3. 検索結果ページの状態

### 現状

検索結果を表示する専用ページは存在しない。

- `frontend/src/app/` 配下に `/search` ルートなし
- `/namecards/page.tsx` にも検索結果表示の仕組みなし

### バックエンド検索APIの存在

**ファイル**: `backend/app/api/v1/endpoints/search.py`

- エンドポイント: `GET /api/v1/search`
- パラメータ: `q`（検索クエリ）, `limit`, `offset`
- 実装: pg_bigm を使用した全文検索
- **正常に動作するが、フロントエンドから呼び出されていない**

**ファイル**: `backend/app/api/v1/api.py`

- `search.router` が `/search` プレフィックスで登録済み

---

## 4. ソート機能の調査

### フロントエンド — ソートUIなし

**ファイル**: `frontend/src/app/(main)/namecards/page.tsx`（全43行）

```
L17-21: パラメータ取得
  const page = Number(searchParams?.page) || 1;
  const per_page = Number(searchParams?.per_page) || 20;
  → search, sort_by, sort_order パラメータを一切取得していない
  
L23-26: API呼び出し
  const response = await getNameCards({ page, per_page });
  → sort_by, sort_order を渡していない
```

**ファイル**: `frontend/src/components/namecard/NameCardList.tsx`（全116行）

- ソートドロップダウン、ソートボタンなどのUI要素なし
- ページネーションのみ実装

### フロントエンドAPI型定義 — ソートパラメータは定義済み

**ファイル**: `frontend/src/lib/api/namecards.ts`

```typescript
// L73-79: GetNameCardsParams
export interface GetNameCardsParams {
  page?: number;
  per_page?: number;
  sort_by?: string;      // ← 定義済みだが未使用
  sort_order?: string;   // ← 定義済みだが未使用
  search?: string;       // ← 定義済みだが、バックエンド /namecards は非対応
}
```

⚠️ **`search` フィールドの不整合**: `GetNameCardsParams` に `search` が定義されているが、バックエンド `/api/v1/namecards` エンドポイントは `search` パラメータを受け付けない。実際の検索は別エンドポイント `/api/v1/search` で行う。

### バックエンド — ソート機能は実装済み

**ファイル**: `backend/app/api/v1/endpoints/namecards.py`

| 行番号 | 内容 |
|--------|------|
| L164-174 | `get_namecards` エンドポイント定義 |
| L175-180 | `sort_by` パラメータ（デフォルト: `created_at`） |
| L181-184 | `order` パラメータ（`asc` / `desc`、デフォルト: `desc`） |
| L185-190 | `tag_id`, `relationship_id` フィルタ |

**対応ソートフィールド（ホワイトリスト）**:

| フィールド | 説明 |
|-----------|------|
| `created_at` | 作成日時（デフォルト） |
| `updated_at` | 最終更新日時 |
| `last_name` | 姓 |
| `first_name` | 名 |
| `last_name_kana` | 姓（かな） |
| `first_name_kana` | 名（かな） |

---

## 5. Playwright UI検証結果

### 検証環境
- Docker コンテナ: frontend (port 3000), backend (port 8000), db (port 5432) — すべて稼働中
- テストユーザー: `pw4test@example.com` / `testpass123`

### 検証結果

| 検証項目 | 結果 | スクリーンショット |
|----------|------|-------------------|
| ヘッダーに検索バーがあるか | ❌ なし | `docs/pw4-namecards-logged-in.png` |
| `/namecards` にソートUIがあるか | ❌ なし | `docs/pw4-namecards-logged-in.png` |
| 検索結果ページが存在するか | ❌ なし | — |
| 空状態の表示 | ✅ 「名刺がありません」表示 | `docs/pw4-namecards-logged-in.png` |

### スクリーンショット

- `docs/pw4-namecards-page.png` — ログイン前（ログインページへリダイレクト）
- `docs/pw4-namecards-logged-in.png` — ログイン後の `/namecards` ページ

---

## 6. 修正提案

### 提案A: ヘッダーに検索バーを統合

**対象ファイル**: `frontend/src/components/layout/Header.tsx`

**変更内容**:
1. `SearchBar` コンポーネントをインポート
2. デスクトップナビ内（`.desktopNav`）に `SearchBar` を配置
3. `onSearch` コールバックで `router.push(/namecards?search=...)` を実行
4. モバイルメニュー内にも検索バーを配置

**実装イメージ**（コード例）:
```tsx
// Header.tsx に追加
import { SearchBar } from '@/components/search/SearchBar';
import { useRouter } from 'next/navigation';

// コンポーネント内
const router = useRouter();
const handleSearch = (query: string) => {
  if (query.trim()) {
    router.push(`/namecards?search=${encodeURIComponent(query)}`);
  } else {
    router.push('/namecards');
  }
};

// JSX内 (.desktopNav の適切な位置に)
<SearchBar onSearch={handleSearch} placeholder="名刺を検索..." />
```

**注意**: `Header.tsx` は現在サーバーコンポーネントの可能性があるため、`'use client'` ディレクティブの確認が必要。

### 提案B: `/namecards` ページにソートUIを追加

**対象ファイル**: `frontend/src/app/(main)/namecards/page.tsx`

**変更内容**:
1. URLクエリパラメータから `sort_by`, `sort_order` を取得
2. ソートセレクトUIを追加（ドロップダウン or ボタングループ）
3. `getNameCards()` 呼び出しに `sort_by`, `sort_order` を渡す

**ソートUIの選択肢**:

| 表示ラベル | `sort_by` 値 | `sort_order` 値 |
|-----------|-------------|----------------|
| 作成日（新しい順） | `created_at` | `desc` |
| 作成日（古い順） | `created_at` | `asc` |
| 更新日（新しい順） | `updated_at` | `desc` |
| 更新日（古い順） | `updated_at` | `asc` |
| 名前（昇順） | `last_name` | `asc` |
| 名前（降順） | `last_name` | `desc` |
| かな（昇順） | `last_name_kana` | `asc` |
| かな（降順） | `last_name_kana` | `desc` |

**新規ファイル（スタイル）**: ソート用の CSS Modules スタイルを `namecards.module.scss` に追加（Tailwind CSS は使用しない）

### 提案C: フロントエンド検索API関数の作成

**対象ファイル**: `frontend/src/lib/api/` 配下に新規作成（例: `search.ts`）

**変更内容**:
1. `/api/v1/search` エンドポイントに対応するAPI関数を作成
2. レスポンス型を定義
3. `/namecards/page.tsx` で `search` クエリパラメータがある場合に検索APIを呼び出す

**実装イメージ**:
```typescript
// frontend/src/lib/api/search.ts
import { apiClient } from './client';

export interface SearchParams {
  q: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  // バックエンドのレスポンス型に合わせる
  items: NameCard[];
  total: number;
}

export async function searchNameCards(params: SearchParams): Promise<SearchResult> {
  const response = await apiClient.get('/api/v1/search', { params });
  return response.data;
}
```

### 提案D: `GetNameCardsParams.search` の整理

**対象ファイル**: `frontend/src/lib/api/namecards.ts` L73-79

**変更内容**:
- `search` フィールドを `GetNameCardsParams` から削除（バックエンド `/namecards` が非対応のため）
- または、バックエンド `/api/v1/namecards` にも `search` パラメータを追加する（提案E参照）

### 提案E（オプション）: バックエンド `/namecards` に検索パラメータ追加

**対象ファイル**: `backend/app/api/v1/endpoints/namecards.py`

現在、検索は `/api/v1/search` でのみ可能。一覧ページでのインライン検索を実現するには:

- 方法1: `/namecards` エンドポイントに `q` パラメータを追加し、pg_bigm 検索を統合
- 方法2: フロントエンドで検索時は `/search` API、一覧時は `/namecards` API と使い分ける

**推奨**: 方法2（既存の検索エンドポイントを活用、責務を分離）

---

## 7. 優先度と実装順序の推奨

| 優先度 | 提案 | 理由 |
|--------|------|------|
| 🔴 高 | 提案B: ソートUI追加 | バックエンド実装済み、フロントエンドUI追加のみ |
| 🔴 高 | 提案A: 検索バー統合 | コンポーネント実装済み、配置のみ |
| 🟡 中 | 提案C: 検索API関数作成 | 検索バーの動作に必須 |
| 🟡 中 | 提案D: 型定義整理 | API不整合の解消 |
| 🟢 低 | 提案E: バックエンド検索統合 | オプション、方法2で代替可能 |

---

## 8. 関連ファイル一覧

### フロントエンド

| ファイル | 行数 | 役割 |
|----------|------|------|
| `frontend/src/components/layout/Header.tsx` | 221 | ヘッダー（検索バーなし） |
| `frontend/src/components/search/SearchBar.tsx` | 79 | 検索バーコンポーネント（未使用） |
| `frontend/src/components/search/SearchBar.module.scss` | 69 | 検索バースタイル（未使用） |
| `frontend/src/app/(main)/namecards/page.tsx` | 43 | 名刺一覧ページ（検索・ソートなし） |
| `frontend/src/app/(main)/namecards/namecards.module.scss` | 6 | 名刺一覧スタイル（最小限） |
| `frontend/src/components/namecard/NameCardList.tsx` | 116 | 名刺リスト（ページネーションのみ） |
| `frontend/src/lib/api/namecards.ts` | 139 | 名刺API（sort/search型定義あり、未使用） |

### バックエンド

| ファイル | 行数 | 役割 |
|----------|------|------|
| `backend/app/api/v1/endpoints/namecards.py` | 372 | 名刺CRUD（ソート実装済み） |
| `backend/app/api/v1/endpoints/search.py` | — | 全文検索（pg_bigm） |
| `backend/app/api/v1/api.py` | — | ルーター設定 |

---
---

# ヘッダー レスポンシブUI 調査レポート

## 調査情報
- 日時: 2026-03-04
- 調査者: Sisyphus-Junior Agent
- 対象: ヘッダーのレスポンシブ対応状況（ブレークポイント・レイアウト・ハンバーガーメニュー・ダークモード切替ボタン配置）
- 方法: コード調査 + Playwright UI検証（5ビューポート幅）

---

## 1. 問題点サマリー

| # | 問題 | 深刻度 |
|---|------|--------|
| 1 | 三段階レスポンシブUIと言ったはずが**二段階**しかない | 🔴 高 |
| 2 | ヘッダーが**早すぎるタイミング**（1024px未満）でモバイル版に切り替わる | 🔴 高 |
| 3 | モバイル版でナビゲーション等のアクション要素が**左揃え**になっている | 🟡 中 |
| 4 | ハンバーガーボタンが右端に配置されていない | 🟡 中 |
| 5 | ダークモード切替ボタンが**ヘッダーに常時表示**されている（ハンバーガーメニュー内に移すべき） | 🟡 中 |

---

## 2. 現状のブレークポイント設定

### 変数定義

**ファイル**: `frontend/src/styles/_variables.scss`（L143-147）

```scss
$bp-sm: 640px;
$bp-md: 768px;
$bp-lg: 1024px;
$bp-xl: 1280px;
```

4段階のブレークポイントが定義されている。

### 実際の使用状況

**ファイル**: `frontend/src/components/layout/header.module.scss`（全238行）

| 行番号 | メディアクエリ | 用途 |
|--------|---------------|------|
| L31 | `@media (min-width: $bp-lg)` | `.header` のパディング変更 |
| L139 | `@media (min-width: $bp-lg)` | `.desktopNav` の表示（`display: flex`） |
| L153 | `@media (min-width: $bp-lg)` | `.addButton span` の表示（テキストラベル表示） |
| L178 | `@media (min-width: $bp-lg)` | `.hamburger` の非表示（`display: none`） |

**問題**: `$bp-lg`（1024px）の**1箇所のみ**をブレークポイントとして使用。

→ **≥1024px = デスクトップ** / **<1024px = モバイル** の**二段階**しかない。

`$bp-sm`、`$bp-md`、`$bp-xl` は `header.module.scss` 内で一切使用されていない。

---

## 3. ヘッダー構造の調査

### Header.tsx のコンポーネント構造

**ファイル**: `frontend/src/components/layout/Header.tsx`（全221行）

```
<header>
  ├── <Link> ブランド「名刺管理」(.brand)
  ├── <nav> デスクトップナビ (.desktopNav)  ← ≥1024px で display:flex
  │   ├── ナビリンク群（組織管理、タグ管理、エクスポート/インポート、ヘルプ）
  │   └── 新規登録ボタン
  ├── <div> アクション群 (.actions)
  │   ├── 新規登録ボタン（モバイル用・アイコンのみ）
  │   ├── テーマ切替ボタン (.themeToggle)  ← 常時表示！
  │   ├── ログアウトボタン（user有時）
  │   └── ハンバーガーボタン (.hamburger)  ← <1024px で表示
  └── モバイルメニュー (.mobileNav)
      ├── ナビリンク群
      └── ログアウトボタン
```

### レイアウトの問題

`header.module.scss` の `.header`:
```scss
.header {
  display: flex;
  align-items: center;
  // ...
}
```

- デスクトップ時: `.brand` → `.desktopNav`（`margin-left: auto`で右寄せ） → `.actions` の順で配置
- モバイル時: `.desktopNav` が `display: none` になるため、`.brand` の直後に `.actions` が左詰めで並ぶ

**→ `.actions` が右端に配置されず、左揃えになる問題の原因**

### ダークモード切替ボタンの問題

- `.themeToggle` は `.actions` 内に配置され**常時表示**
- モバイルメニュー（`.mobileNav`）内にはダークモード切替がない
- モバイル時でもヘッダーに表示され続ける

---

## 4. Playwright UI検証結果

### 検証環境
- Docker コンテナ: frontend (:3000), backend (:8000), db (:5432 healthy) — すべて稼働中
- テストユーザー: `test@example.com` / `testpassword123`
- ログイン状態: http://localhost:3000/namecards

### 検証結果一覧

| ビューポート幅 | 表示モード | desktopNav | hamburger | actions配置 | スクリーンショット |
|---------------|-----------|------------|-----------|------------|-------------------|
| 1280px | デスクトップ | ✅ 表示 | ❌ 非表示 | 右端 | `docs/screenshots/header_1280px.png` |
| 1024px | デスクトップ | ✅ 表示 | ❌ 非表示 | 右端 | `docs/screenshots/header_1024px.png` |
| 1023px | モバイル | ❌ 非表示 | ✅ 表示 | **左寄り** | `docs/screenshots/header_1023px.png` |
| 768px | モバイル | ❌ 非表示 | ✅ 表示 | **左寄り** | `docs/screenshots/header_768px.png` |
| 480px | モバイル | ❌ 非表示 | ✅ 表示 | **左寄り** | `docs/screenshots/header_480px.png` |

### モバイルメニュー展開時

- ビューポート: 480px
- スクリーンショット: `docs/screenshots/header_480px_menu_open.png`
- メニュー内: 組織管理、タグ管理、エクスポート/インポート、ヘルプ、ログアウト
- **メニュー内にダークモード切替ボタンなし**

### 確認した問題点

1. **二段階しかない**: 1024px を境にデスクトップ/モバイルの2つしかない。タブレット向けの中間段階がない。
2. **早すぎる切替**: 1023px以下でモバイル表示になるが、タブレット幅（768px〜1023px）ではまだデスクトップナビを表示する余裕がある。
3. **左揃え問題**: 768px, 480px のスクリーンショットで、ブランド名の隣にアクション群が左寄りに並んでいることを確認。
4. **テーマ切替の常時表示**: 全ビューポート幅でヘッダーにテーマ切替ボタンが表示されている。

---

## 5. 修正提案

### 提案1: 三段階レスポンシブUIの導入

**対象ファイル**: `frontend/src/components/layout/header.module.scss`

**方針**: 3つのビューポート区分を設ける

| 区分 | ビューポート幅 | UI |
|------|---------------|-----|
| デスクトップ | ≥1280px (`$bp-xl`) | フルナビ表示、全アクション表示 |
| タブレット | ≥768px (`$bp-md`) 〜 <1280px | コンパクトナビ（アイコン＋テキスト短縮）or ハンバーガー＋主要アクション表示 |
| モバイル | <768px (`$bp-md`) | ハンバーガーメニューのみ |

**変更箇所**:
- L31: `.header` のパディング → `$bp-md` と `$bp-xl` の2段階に分ける
- L139: `.desktopNav` の `display: flex` → `$bp-xl` に変更（or タブレット向けにコンパクト表示を追加）
- L153: `.addButton span` → `$bp-xl` に変更
- L178: `.hamburger` の `display: none` → `$bp-xl` に変更（or `$bp-md` でタブレット表示にする）

### 提案2: actionsの右端配置

**対象ファイル**: `frontend/src/components/layout/header.module.scss`

**変更内容**: `.header` に `justify-content: space-between` を追加

```scss
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;  // ← 追加
  // ...
}
```

これにより `.brand` が左端、`.actions` が右端に配置される。

**注意**: `.desktopNav` の `margin-left: auto` との整合性を確認する必要あり。

### 提案3: ハンバーガーボタンの右端配置

**対象ファイル**: `frontend/src/components/layout/Header.tsx` + `header.module.scss`

`.actions` 内の要素順序を変更し、ハンバーガーが最右端に来るようにする（現状は最後に配置されているが、提案2と組み合わせて右端に移動する）。

### 提案4: ダークモード切替ボタンのハンバーガーメニュー内移動

**対象ファイル**:
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/components/layout/header.module.scss`

**変更内容**:
1. `.actions` 内の `themeToggle` を削除（またはデスクトップ時のみ表示）
2. モバイルメニュー（`.mobileNav`）内にダークモード切替を追加

**Header.tsx 変更イメージ**:
```
モバイルメニュー (.mobileNav) 変更後:
├── ナビリンク群
├── ダークモード切替ボタン  ← 追加
└── ログアウトボタン
```

---

## 6. 優先度と実装順序の推奨

| 優先度 | 提案 | 理由 |
|--------|------|------|
| 🔴 高 | 提案1: 三段階レスポンシブUI | 要件に対する根本的な乖離 |
| 🔴 高 | 提案2: actionsの右端配置 | 使い勝手に直結。CSS 1行追加で解決の可能性 |
| 🟡 中 | 提案4: ダークモード切替のメニュー内移動 | ヘッダーの簡素化＋モバイルUX改善 |
| 🟢 低 | 提案3: ハンバーガー右端配置 | 提案2で自動的に解決される可能性あり |

---

## 7. 関連ファイル一覧

| ファイル | 行数 | 役割 |
|----------|------|------|
| `frontend/src/styles/_variables.scss` | L143-147 | ブレークポイント変数定義 |
| `frontend/src/components/layout/Header.tsx` | 221 | ヘッダーコンポーネント |
| `frontend/src/components/layout/header.module.scss` | 238 | ヘッダースタイル |

## 8. スクリーンショット一覧

| ファイル | 説明 |
|----------|------|
| `docs/screenshots/header_1280px.png` | デスクトップ表示（1280px） |
| `docs/screenshots/header_1024px.png` | デスクトップ表示（1024px、境界値） |
| `docs/screenshots/header_1023px.png` | モバイル表示（1023px、切替直後） |
| `docs/screenshots/header_768px.png` | モバイル表示（768px、タブレット幅） |
| `docs/screenshots/header_480px.png` | モバイル表示（480px、スマートフォン幅） |
| `docs/screenshots/header_480px_menu_open.png` | モバイルメニュー展開時（480px） |

---

# +ボタン フローティング化 調査レポート

## 1. 問題の概要

ユーザーからの指摘:
- 「+ボタンは右下に」と明確に指示されたにも関わらず、**ヘッダー内に配置**されている
- **フローティングアクションボタン（FAB）**として右下に固定配置すべき

## 2. 現在の実装状況

### 2.1 ボタンの配置場所

| 項目 | 値 |
|------|-----|
| **ファイル** | `frontend/src/components/layout/Header.tsx` |
| **行番号** | 120〜126行目 |
| **親要素** | `.actions` div（119行目）、`<header>` 内 |
| **要素タイプ** | `<Link>` (`next/link`) |

```tsx
// Header.tsx L120-126
<Link
  href="/namecards/new"
  className={styles.addButton}
  aria-label="新規登録"
>
  <Plus size={20} />
</Link>
```

### 2.2 現在のスタイル

| 項目 | 値 |
|------|-----|
| **ファイル** | `frontend/src/components/layout/header.module.scss` |
| **行番号** | 86〜101行目 |
| **position** | `static`（デフォルト） |
| **display** | `inline-flex` |
| **サイズ** | `2.25rem × 2.25rem`（36×36px） |
| **border-radius** | `$radius-full`（円形） |
| **背景色** | `var(--color-accent)` |

```scss
// header.module.scss L86-101
.addButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: $radius-full;
  color: var(--color-accent-foreground);
  background-color: var(--color-accent);
  text-decoration: none;
  transition: background-color $transition-fast;
  &:hover {
    background-color: var(--color-accent-hover);
  }
}
```

### 2.3 問題点

- `position: static` のため、ヘッダーのフレックスレイアウト内に**埋もれている**
- `position: fixed` が設定されておらず、**スクロールしても追従しない**
- ヘッダーの `.actions` コンテナ内にあるため、ヘッダーの他のUI要素と**横並び**になっている
- モバイル表示では `top: 13.5px, left: 132px` に位置（ヘッダー内、右下ではない）

## 3. Playwright UI確認結果

### 3.1 撮影したスクリーンショット

| ファイル | 説明 |
|----------|------|
| `docs/screenshots/fab_desktop_1280.png` | デスクトップ表示（1280px）— +ボタンがヘッダー内に配置されている |
| `docs/screenshots/fab_mobile_480.png` | モバイル表示（480px）— +ボタンがヘッダー内に配置されている |

### 3.2 確認結果

- **デスクトップ（1280px）**: +ボタンはヘッダー右側の `.actions` エリア内に表示。ヘッダーの他の要素（検索、ユーザーメニュー等）と横並び。
- **モバイル（480px）**: +ボタンはヘッダー上部に表示。ハンバーガーメニューの横に位置。画面右下には存在しない。

## 4. 修正案: FAB（フローティングアクションボタン）化

### 4.1 方針

1. `Header.tsx` から +ボタン（`<Link>` 要素）を**削除**
2. 新規 FAB コンポーネントを作成し、メインレイアウト (`app/(main)/layout.tsx`) に配置
3. `position: fixed` で画面右下に固定

### 4.2 新規コンポーネント案

**ファイル**: `frontend/src/components/ui/FloatingAddButton.tsx`

```tsx
import Link from "next/link";
import { Plus } from "lucide-react";
import styles from "./floatingAddButton.module.scss";

export function FloatingAddButton() {
  return (
    <Link
      href="/namecards/new"
      className={styles.fab}
      aria-label="新規名刺登録"
    >
      <Plus size={24} />
    </Link>
  );
}
```

### 4.3 SCSS案

**ファイル**: `frontend/src/components/ui/floatingAddButton.module.scss`

```scss
@use "../../styles/variables" as *;

.fab {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: $z-sticky; // 100 — ヘッダーと同じレイヤー

  display: flex;
  align-items: center;
  justify-content: center;

  width: 3.5rem;   // 56px — Material Design FAB標準サイズ
  height: 3.5rem;
  border: none;
  border-radius: $radius-full;

  color: var(--color-accent-foreground);
  background-color: var(--color-accent);
  box-shadow: $shadow-lg; // 浮遊感を出すためにlgシャドウ
  text-decoration: none;
  cursor: pointer;
  transition: background-color $transition-fast, box-shadow $transition-fast, transform $transition-fast;

  &:hover {
    background-color: var(--color-accent-hover);
    box-shadow: $shadow-xl;
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
}
```

### 4.4 レイアウト変更案

**ファイル**: `frontend/src/app/(main)/layout.tsx`

```tsx
// 変更前
import Header from "@/components/layout/Header";

export default function MainLayout({ children }) {
  return (
    <>
      <Header />
      <main>{children}</main>
    </>
  );
}

// 変更後
import Header from "@/components/layout/Header";
import { FloatingAddButton } from "@/components/ui/FloatingAddButton";

export default function MainLayout({ children }) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <FloatingAddButton />
    </>
  );
}
```

### 4.5 Header.tsx からの削除箇所

`Header.tsx` の120〜126行目を削除:

```tsx
// 削除対象（L120-126）
<Link
  href="/namecards/new"
  className={styles.addButton}
  aria-label="新規登録"
>
  <Plus size={20} />
</Link>
```

`header.module.scss` の `.addButton` スタイル（L86-101）も不要になるため削除可能。

### 4.6 使用するデザイントークン一覧

| トークン | 値 | 用途 |
|----------|-----|------|
| `$radius-full` | — | 円形ボタン |
| `$z-sticky` | `100` | 固定位置のz-index |
| `$shadow-lg` | `0 10px 15px -3px rgba(0,0,0,0.1), ...` | FABの浮遊感 |
| `$shadow-xl` | `0 20px 25px -5px rgba(0,0,0,0.1), ...` | ホバー時の強調 |
| `$transition-fast` | — | アニメーション速度 |
| `var(--color-accent)` | — | ボタン背景色 |
| `var(--color-accent-foreground)` | — | アイコン色 |
| `var(--color-accent-hover)` | — | ホバー時背景色 |

## 5. 考慮事項

1. **ページ限定表示**: FABを全ページに表示するか、名刺一覧ページ (`/namecards`) のみに表示するかは要検討。レイアウトに配置する場合は全ページに表示される。ページ限定にする場合は `namecards/page.tsx` に直接配置する。
2. **スクロール時の挙動**: `position: fixed` のため、スクロールしても常に画面右下に表示される。
3. **他のUI要素との重なり**: トーストメッセージ（`$z-toast: 300`）やモーダル（`$z-modal: 200`）より低いz-indexなので、これらの表示時にFABが隠れる（正しい挙動）。
4. **Tailwind CSS不使用**: 既存のSCSS + デザイントークンの体系に準拠。Tailwindは使用しない。

---
---

# ロゴタップでログインページに飛ぶ問題 調査レポート

## 調査情報
- 日時: 2026-03-04
- 調査者: Sisyphus-Junior Agent
- 対象: ヘッダーロゴ「名刺管理」タップ時のリダイレクト問題 + 名刺一覧ナビの消失
- 方法: コード調査 + git履歴調査 + Playwright UI検証

---

## 1. 問題サマリー

| # | 問題 | 深刻度 |
|---|------|--------|
| 1 | ロゴ「名刺管理」をタップすると**毎回ログインページに飛ばされる** | 🔴 致命的 |
| 2 | ヘッダーのナビゲーションから**名刺一覧リンクが消えている** | 🔴 高 |
| 3 | 名刺一覧ナビを削除した判断が**AIの独断**で行われた | 🟡 プロセス問題 |

---

## 2. 原因の特定

### 2.1 ロゴが `/login` にリダイレクトされる原因

**リダイレクトの流れ:**

```
ユーザーがロゴをクリック
    ↓
<Link href="/"> (Header.tsx L90)
    ↓
app/page.tsx のルートページにマッチ
    ↓
redirect("/login") (app/page.tsx L4) ← ★無条件リダイレクト
    ↓
ログインページが表示される
```

**根本原因は2つのファイルの組み合わせ:**

| ファイル | 行番号 | 内容 | 問題 |
|----------|--------|------|------|
| `frontend/src/components/layout/Header.tsx` | L90 | `<Link href="/">` | ロゴのリンク先が `/`（ルート） |
| `frontend/src/app/page.tsx` | L4 | `redirect("/login")` | ルートにアクセスすると**認証状態に関係なく**ログインページにリダイレクト |

**補足**: `app/(main)/page.tsx` は `redirect("/namecards")` を持っているが、これは `(main)` ルートグループ内のページであり、`/` のパスではマッチしない。`/` は `app/page.tsx` にマッチする。

### 2.2 なぜ `href="/"` なのか

git履歴を調査した結果:

- **コミット `fcc6628`**（`feat: implement Wave 1-2`）でHeader.tsxが初めて作成された時点から `href="/"` だった
- **一度も変更されていない**
- 同じコミットで `app/page.tsx` が `redirect("/login")` に変更された

つまり、**最初の実装時点から壊れていた**。ただし、当時は名刺一覧（`/namecards`）がNAV_ITEMSに含まれていたため、ロゴをタップしなくてもナビから直接名刺一覧にアクセスできた。

### 2.3 名刺一覧ナビが消えた経緯

**コミット `df54f3f`**:
```
fix(frontend): ヘッダーUI再修正 — 名刺一覧ナビ削除、+アイコンのみの新規登録ボタン追加、ページ側の重複要素削除
```

このコミットで以下が行われた:

```diff
 const NAV_ITEMS: NavItem[] = [
-  { href: "/namecards", label: "名刺一覧", icon: <CreditCard size={16} /> },
   {
     href: "/relationships",
     label: "組織管理",
```

- `NAV_ITEMS` から `{ href: "/namecards", label: "名刺一覧" }` が**削除**された
- 同時に `+` ボタン（新規名刺登録）が追加された
- この判断は**ultrabrainの承認なしに行われた**

### 2.4 現在のヘッダーナビ構成

```
現在の NAV_ITEMS:
├── /relationships  → 組織管理
├── /tags           → タグ管理
├── /import-export  → エクスポート/インポート
└── /help           → ヘルプ

❌ /namecards（名刺一覧）が存在しない
```

---

## 3. Next.js ルーティング構造の説明

```
app/
├── page.tsx                    → パス: /        → redirect("/login")  ← ★問題
├── (auth)/
│   ├── layout.tsx              → 認証レイアウト（ヘッダーなし）
│   ├── login/page.tsx          → パス: /login
│   └── register/page.tsx       → パス: /register
└── (main)/
    ├── layout.tsx              → メインレイアウト（ヘッダーあり）
    ├── page.tsx                → パス: / (mainグループ内) → redirect("/namecards")
    ├── namecards/page.tsx      → パス: /namecards
    ├── relationships/page.tsx  → パス: /relationships
    ├── tags/page.tsx           → パス: /tags
    ├── import-export/page.tsx  → パス: /import-export
    └── help/page.tsx           → パス: /help
```

**重要**: Next.js のルートグループ `(auth)` と `(main)` はURLパスに影響しない。`app/page.tsx` と `app/(main)/page.tsx` が両方とも `/` にマッチする構造だが、`app/page.tsx` が優先される。

**ミドルウェア (`middleware.ts`) は存在しない** → 認証状態によるルーティング制御がサーバーサイドで行われていない。認証はクライアントサイドの `AuthContext` (localStorage の `access_token`) のみで管理。

---

## 4. Playwright UI検証結果

### 検証環境
- Docker コンテナ: frontend (:3000), backend (:8000), db (:5432 healthy) — すべて稼働中
- テストユーザー: `pw4test@example.com` / `testpass123`

### 検証手順と結果

| ステップ | 操作 | 結果 | URL |
|----------|------|------|-----|
| 1 | `/login` に移動 | ログインフォーム表示 | `/login` |
| 2 | テストユーザーでログイン | ログイン成功、名刺一覧にリダイレクト | `/namecards` |
| 3 | ヘッダーのロゴ「名刺管理」をクリック | **ログインページに飛ばされた** | `/login` |

### ロゴリンクの確認（Playwrightスナップショットより）

```yaml
# ログイン後の /namecards ページのヘッダー
- banner:
    - link "名刺管理":
        - /url: /          ← ★ ルート(/)を指している
```

### スクリーンショット

| ファイル | 説明 |
|----------|------|
| `docs/screenshots/logo_redirects_to_login.png` | ログイン状態でロゴクリック後 → ログインページに遷移した状態 |

---

## 5. 修正案

### 修正案A: ロゴのリンク先を `/namecards` に変更（最小修正）

**対象ファイル**: `frontend/src/components/layout/Header.tsx` L90

```diff
- <Link href="/" className={styles.brand}>
+ <Link href="/namecards" className={styles.brand}>
```

**効果**: ロゴタップで名刺一覧に遷移するようになる
**工数**: Quick（1行変更）
**リスク**: なし

### 修正案B: 名刺一覧をNAV_ITEMSに復活

**対象ファイル**: `frontend/src/components/layout/Header.tsx` L31-44

```diff
 const NAV_ITEMS: NavItem[] = [
+  {
+    href: "/namecards",
+    label: "名刺一覧",
+    icon: <CreditCard size={16} />,
+    isPrimary: true,
+  },
   {
     href: "/relationships",
     label: "組織管理",
```

**効果**: ヘッダーナビから名刺一覧に直接アクセスできるようになる
**工数**: Quick（数行追加 + `CreditCard` アイコンのインポート復活）
**リスク**: なし

### 修正案C: `app/page.tsx` のリダイレクトロジックを認証状態に応じた分岐に変更

**対象ファイル**: `frontend/src/app/page.tsx`

現在:
```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/login");  // 無条件でログインへ
}
```

**選択肢1**: 単純に `/namecards` にリダイレクト
```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/namecards");
}
```

**選択肢2**: `app/page.tsx` を削除して `app/(main)/page.tsx` のルーティングに任せる
（ただしNext.jsのルートグループの優先度の確認が必要）

**効果**: ルートアクセス時の挙動が改善される
**工数**: Quick
**リスク**: 中（認証未済ユーザーがルートにアクセスした場合の挙動を別途考慮する必要あり。現在middleware.tsが存在しないため、認証ガードがクライアントサイドに依存している）

---

## 6. 推奨修正方針

| 優先度 | 修正案 | 理由 |
|--------|--------|------|
| 🔴 必須 | **A: ロゴリンク先を `/namecards` に変更** | 即座にバグを解消。1行変更でリスクなし |
| 🔴 必須 | **B: 名刺一覧をナビに復活** | ユーザーが明確に要求。メインコンテンツへのナビがないのは致命的UX問題 |
| 🟡 推奨 | **C: `app/page.tsx` のリダイレクト修正** | ルートURLの挙動を正しくする。AとBで運用上は問題なくなるが、根本的な設計の歪みが残る |

**注意**: 修正案Bについて、名刺一覧ナビを復活させるかどうかは**ultrabrainの判断を仰ぐべき**。AIが勝手に削除した経緯があるため、復活についても独断で行うべきではない。

---

## 7. 関連ファイル一覧

| ファイル | 行番号 | 役割 |
|----------|--------|------|
| `frontend/src/components/layout/Header.tsx` | L90 | ロゴリンク先 `href="/"` |
| `frontend/src/components/layout/Header.tsx` | L31-44 | NAV_ITEMS定義（名刺一覧なし） |
| `frontend/src/app/page.tsx` | L4 | ルート → `redirect("/login")` |
| `frontend/src/app/(main)/page.tsx` | L4 | mainグループルート → `redirect("/namecards")` |
| `frontend/src/lib/contexts/AuthContext.tsx` | 全体 | 認証状態管理（クライアントサイドのみ） |

## 8. スクリーンショット一覧

| ファイル | 説明 |
|----------|------|
| `docs/screenshots/logo_redirects_to_login.png` | ログイン済みでロゴクリック後、ログインページに飛ばされた状態 |

---

# 調査レポート: 名刺一覧ページのマージン・パディング問題

| 項目 | 内容 |
|------|------|
| 調査日 | 2026-03-04 |
| 対象ページ | `/namecards`（名刺一覧ページ） |
| 報告者 | 調査エージェント |
| 調査方法 | コード解析 + Playwright UI検証（デスクトップ1280px / モバイル480px） |
| ステータス | 調査完了（コード修正なし） |

## 1. 問題概要

名刺一覧ページ（`/namecards`）において、**上部および左右の余白がゼロ**になっており、コンテンツがビューポートの端にぎちぎちに詰まって表示される。他のページ（タグ、関係性、ヘルプ）では適切な余白が設定されているため、名刺一覧ページだけが不自然に窮屈に見える。

## 2. 根本原因

レイアウトの3つの階層すべてでパディング・マージンがゼロであることが原因。

### 2.1 各レイヤーの余白状況

| レイヤー | 要素 | padding | margin | max-width | ファイル |
|----------|------|---------|--------|-----------|----------|
| 1 | `<main>` | **0px** | **0px** | なし | `frontend/src/app/(main)/layout.tsx` L12 |
| 2 | `.page` | **0px** | **0px** | なし | `frontend/src/app/(main)/namecards/namecards.module.scss` L1-5 |
| 3 | `.container` | **0px** | **0px** | なし | `frontend/src/components/namecard/NameCardList.module.scss` L3-7 |

### 2.2 ゼロになる理由

`frontend/src/app/globals.scss` にCSSリセットが存在する：

```scss
* {
  padding: 0;
  margin: 0;
}
```

このリセットにより、明示的にpadding/marginを指定しない限りすべての要素がゼロになる。名刺一覧ページでは**どの階層でも明示的な余白指定がない**。

### 2.3 Playwright検証結果（Computed Styles）

デスクトップ（1280px）で取得した実際のComputed Style値：

| 要素 | padding-top | padding-left | padding-right | margin-top | margin-left | margin-right |
|------|------------|-------------|--------------|-----------|------------|-------------|
| `<main>` | 0px | 0px | 0px | 0px | 0px | 0px |
| `.page` | 0px | 0px | 0px | 0px | 0px | 0px |
| `.container` | 0px | 0px | 0px | 0px | 0px | 0px |

## 3. 他ページとの比較

### 3.1 正常なページのスタイル

タグ、関係性、ヘルプページでは共通して以下の `.page` スタイルを使用している：

```scss
// tags.module.scss / relationships.module.scss / help.module.scss
.page {
  max-width: 48rem;
  margin: $space-8 auto;    // = 2rem auto（上下32px、左右中央揃え）
  padding: 0 $space-4;      // = 0 1rem（左右16px）
}
```

### 3.2 名刺一覧ページの現行スタイル

```scss
// namecards.module.scss
.page {
  display: flex;
  flex-direction: column;
  gap: $space-6;
}
```

**`max-width`、`margin`、`padding` がすべて欠落している。**

### 3.3 比較表

| プロパティ | 名刺一覧 | タグ / 関係性 / ヘルプ |
|-----------|---------|---------------------|
| `max-width` | ❌ なし | ✅ `48rem` |
| `margin` | ❌ `0` | ✅ `$space-8 auto`（2rem auto） |
| `padding` | ❌ `0` | ✅ `0 $space-4`（0 1rem） |
| `display: flex` | ✅ あり | ❌ なし |
| `gap` | ✅ `$space-6` | ❌ なし |

## 4. 影響ファイルと行番号

| ファイル | 行 | 問題 |
|----------|-----|------|
| `frontend/src/app/(main)/layout.tsx` | L12 | `<main>{children}</main>` — クラスもスタイルもなし。padding/marginゼロ |
| `frontend/src/app/(main)/namecards/namecards.module.scss` | L1-5 | `.page` に `max-width`、`margin`、`padding` がない |
| `frontend/src/components/namecard/NameCardList.module.scss` | L3-7 | `.container` に padding/margin がない |

### 4.1 スペーシング変数一覧（`_variables.scss`）

| 変数 | 値 | 用途 |
|------|-----|------|
| `$space-4` | `1rem`（16px） | 他ページの左右padding |
| `$space-6` | `1.5rem`（24px） | 名刺一覧のgap |
| `$space-8` | `2rem`（32px） | 他ページの上下margin |

## 5. 修正提案

### 5.1 推奨修正（最小変更）

`frontend/src/app/(main)/namecards/namecards.module.scss` の `.page` に、他ページと同じ余白設定を追加する：

```scss
// namecards.module.scss — 修正案
.page {
  max-width: 48rem;
  margin: $space-8 auto;
  padding: 0 $space-4;
  display: flex;
  flex-direction: column;
  gap: $space-6;
}
```

### 5.2 修正の根拠

- 他の3ページ（tags, relationships, help）と**完全に同じパターン**に揃える
- 既存の `display: flex` / `flex-direction: column` / `gap` はそのまま維持
- `max-width: 48rem` でコンテンツ幅を制限し、大画面でも読みやすくする
- `margin: $space-8 auto` で上下余白と左右中央揃えを確保
- `padding: 0 $space-4` でモバイルでも左右に最低16pxの余白を確保

### 5.3 修正箇所

**1ファイル・3行追加のみ**。`layout.tsx` と `NameCardList.module.scss` の変更は不要。

## 6. スクリーンショット一覧

| ファイル | 説明 |
|----------|------|
| `docs/screenshots/margin_issue_desktop_1280.png` | デスクトップ表示（1280px）— コンテンツがビューポート端まで広がっている |
| `docs/screenshots/margin_issue_mobile_480.png` | モバイル表示（480px）— 左右余白ゼロでカードが画面端に接触 |

---
---

# 問題1 修正結果: ヘッダー検索バー・ソート機能の実装

## 修正情報
- 日時: 2026-03-04
- 実施者: Sisyphus-Junior Agent
- 対象: ヘッダーへの検索バー統合、名刺一覧ページへのソートUI追加
- 方法: コード実装 + Playwright UI検証

---

## 1. 修正結果サマリー

| 項目 | 修正前 | 修正後 |
|------|--------|--------|
| ヘッダーの検索バー | ❌ 存在しない | ✅ デスクトップ・モバイル両方に配置 |
| `SearchBar` コンポーネント | ⚠️ 未使用 | ✅ Header.tsx で使用 |
| 検索結果表示 | ❌ なし | ✅ `/namecards?search=...` で検索結果を表示 |
| ソートUI | ❌ なし | ✅ ソートドロップダウン + 昇順/降順トグルボタン |
| フロントエンド検索API関数 | ❌ なし（※実際は `search.ts` に既存） | ✅ `searchNameCards()` をページで使用 |
| `getNameCards` のソートパラメータ | ⚠️ `sort_order` をそのまま送信（バックエンド非対応） | ✅ `sort_order` → `order` にマッピングして送信 |

---

## 2. 修正内容

### 2.1 ヘッダーに検索バー統合

**ファイル**: `frontend/src/components/layout/Header.tsx`

- `SearchBar` コンポーネントをインポート
- `useRouter`, `useSearchParams` を使用
- `handleSearch` コールバック: 検索クエリがあれば `/namecards?search=...` に遷移、なければ `/namecards` に遷移
- **デスクトップ**: `.searchWrapper` 内に配置（`desktopNav` と `actions` の間）
- **モバイル**: `.mobileSearchWrapper` 内に配置（`mobileNav` の先頭）
- `initialValue` prop で URL パラメータから検索クエリを復元

### 2.2 検索バースタイル

**ファイル**: `frontend/src/components/layout/header.module.scss`

- `.searchWrapper`: デフォルト非表示、`≥1024px` で `display: block`、`flex: 1`、`max-width: 20rem`
- `.mobileSearchWrapper`: `padding: 0 $space-4 $space-2`

### 2.3 SearchBar コンポーネントの拡張

**ファイル**: `frontend/src/components/search/SearchBar.tsx`

- `initialValue` プロパティを追加（デフォルト `""`）
- `useState(initialValue)` で初期値を設定可能に

### 2.4 名刺一覧ページにソートUI追加

**ファイル**: `frontend/src/app/(main)/namecards/page.tsx`

- `NameCardsContent`（`useSearchParams` 使用）と `NameCardsPage`（`Suspense` ラッパー）に分割
- ソート状態: `sortBy`（`"updated_at"` | `"last_name"` | `"created_at"`）、`sortOrder`（`"asc"` | `"desc"`）
- ソートUI: `<select>` で項目選択 + ボタンで昇順/降順トグル（`ArrowUpAZ` / `ArrowDownAZ` アイコン）
- 検索クエリがある場合: `searchNameCards()` を呼び出し
- 検索クエリがない場合: `getNameCards()` を呼び出し（ソートパラメータ付き）
- 検索結果件数を「「○○」の検索結果: N件」として表示

### 2.5 ソートUIスタイル

**ファイル**: `frontend/src/app/(main)/namecards/namecards.module.scss`

- `.toolbar`, `.sortGroup`, `.sortLabel`, `.sortSelect`, `.sortOrderButton`, `.searchInfo` スタイル追加
- レスポンシブ対応: `≤640px` で縦並び

### 2.6 API修正

**ファイル**: `frontend/src/lib/api/namecards.ts`

- `getNameCards()` 内で `sort_order` を `order` にマッピング（バックエンドが `order` パラメータを期待するため）

### 2.7 レイアウト修正

**ファイル**: `frontend/src/app/(main)/layout.tsx`

- `<Header />` を `<Suspense>` でラップ（`useSearchParams()` が Suspense 境界を必要とするため）

---

## 3. Playwright UI検証結果

### 検証環境
- Docker コンテナ: frontend (:3000), backend (:8000), db (:5432 healthy) — すべて稼働中
- テストユーザー: `pw4test@example.com` / `testpass123`
- ビューポート: 1280×900（デスクトップ）
- テストデータ: 5件の名刺（田中太郎、鈴木花子、佐藤次郎、山田美咲、伊藤健一）

### 検証結果

| # | 検証項目 | 結果 | 詳細 |
|---|----------|------|------|
| 1 | デスクトップヘッダーに検索バーが表示される | ✅ 合格 | `searchbox "検索"` がヘッダー内に表示 |
| 2 | ソートUIが表示される（3項目 + トグルボタン） | ✅ 合格 | `combobox "ソート項目"` に「最終更新日」「名前」「作成日」の3オプション + 「降順」ボタン |
| 3 | デフォルトソート（最終更新日・降順）が正しい | ✅ 合格 | 伊藤→山田→佐藤→鈴木→田中（最後に作成したカードが先頭） |
| 4 | 検索が機能する（「田中」で検索） | ✅ 合格 | URLが `/namecards?search=田中` に変更、「田中 太郎」のみ表示、「「田中」の検索結果: 1件」表示 |
| 5 | ソート項目変更（名前・降順） | ✅ 合格 | 鈴木→田中→山田→佐藤→伊藤（日本語の降順） |
| 6 | ソート順トグル（名前・昇順） | ✅ 合格 | 伊藤→佐藤→山田→田中→鈴木（日本語の昇順）、ボタンラベルが「昇順」に変更 |

### スクリーンショット

| ファイル | 説明 |
|----------|------|
| `docs/screenshots/namecards_with_sort_and_search.png` | 名刺一覧ページ（検索バー + ソートUI表示、デフォルトソート） |
| `docs/screenshots/search_result_tanaka.png` | 「田中」の検索結果（1件表示、検索結果件数表示） |
| `docs/screenshots/sort_by_name_asc.png` | 名前昇順ソート（伊藤→佐藤→山田→田中→鈴木） |

---

## 4. 修正ファイル一覧

| ファイル | 変更種別 | 概要 |
|----------|----------|------|
| `frontend/src/components/layout/Header.tsx` | 変更 | SearchBar統合、handleSearch追加 |
| `frontend/src/components/layout/header.module.scss` | 変更 | `.searchWrapper`, `.mobileSearchWrapper` 追加 |
| `frontend/src/components/search/SearchBar.tsx` | 変更 | `initialValue` プロパティ追加 |
| `frontend/src/app/(main)/namecards/page.tsx` | 大幅変更 | ソートUI + 検索統合、Suspense対応 |
| `frontend/src/app/(main)/namecards/namecards.module.scss` | 大幅変更 | ソートUI用スタイル追加 |
| `frontend/src/lib/api/namecards.ts` | 変更 | `sort_order` → `order` マッピング修正 |
| `frontend/src/app/(main)/layout.tsx` | 変更 | Header を Suspense でラップ |

---
---

# 問題2 修正結果: レスポンシブUI三段階化とモバイルUI修正

## 修正情報
- 日時: 2026-03-04
- 実施者: Sisyphus-Junior Agent
- 対象: ヘッダーの三段階レスポンシブ化、ハンバーガーボタン右端配置、ダークモード切替のモバイルメニュー内移動、モバイルナビ右揃え
- 方法: コード実装 + Playwright UI検証（4ビューポート幅）

---

## 1. 修正結果サマリー

| 項目 | 修正前 | 修正後 |
|------|--------|--------|
| ブレークポイント構成 | 2段階（≥1024px / <1024px） | 3段階（≥1280px / 768-1279px / <768px） |
| デスクトップ（≥1280px） | フルナビ表示 | フルナビ表示（アイコン＋テキストラベル）、検索バー20rem |
| タブレット（768-1279px） | なし（デスクトップと同一） | 中間状態：アイコンのみナビ（ラベル非表示）、検索バー14rem |
| モバイル（<768px） | <1024pxでハンバーガーメニュー | <768pxでハンバーガーメニュー |
| ハンバーガーボタン位置 | ヘッダー内 | ✅ 右端に配置 |
| ダークモード切替（デスクトップ/タブレット） | ヘッダー内表示 | ✅ ヘッダー内表示（タブレット以上） |
| ダークモード切替（モバイル） | ヘッダー内表示 | ✅ ハンバーガーメニュー内に移動（「ライトモード」/「ダークモード」テキスト付き） |
| モバイルナビ方向 | 左から | ✅ 右から（right: 0でスライドイン） |

---

## 2. 修正内容

### 2.1 ヘッダーSCSS三段階ブレークポイント化

**ファイル**: `frontend/src/components/layout/header.module.scss`

- ブレークポイント境界を `$bp-lg`（1024px） → `$bp-md`（768px）/ `$bp-xl`（1280px）に変更
- `.desktopNav`: `≥$bp-md` で表示
- `.navLinkLabel`: デフォルト `display: none`、`≥$bp-xl` で `display: inline`（タブレットではラベル非表示）
- `.navLinkIcon`: アイコン表示用クラス追加
- ナビリンク: タブレット時コンパクトpadding（`@media (min-width: $bp-md) and (max-width: #{$bp-xl - 1px})`）
- `.hamburger`: `≥$bp-md` で非表示
- `.themeToggleDesktop`: `<$bp-md` で非表示、`≥$bp-md` で表示
- `.mobileThemeToggle`: モバイルメニュー内テーマ切替ボタンスタイル
- `.searchWrapper`: `≥$bp-md` で表示、max-width 14rem → `≥$bp-xl` で 20rem
- `.mobileNav`: `right: 0` で右からスライドイン、`≥$bp-md` で非表示

### 2.2 ヘッダーTSX修正

**ファイル**: `frontend/src/components/layout/Header.tsx`

- デスクトップナビリンクにアイコン（`<span className={styles.navLinkIcon}>`）とラベル（`<span className={styles.navLinkLabel}>`）のspan要素を追加
- ヘッダー内テーマ切替ボタンに `themeToggleDesktop` クラスを追加（モバイルで非表示）
- モバイルメニュー（`mobileList`）内に `<li>` でテーマ切替ボタンを追加（`mobileThemeToggle` クラス）
  - 「ライトモード」/「ダークモード」テキスト表示

---

## 3. Playwright UI検証結果

### 検証環境
- Docker コンテナ: frontend (:3000), backend (:8000), db (:5432 healthy) — すべて稼働中
- テストユーザー: `test@example.com` / `testpassword123`
- 検証ビューポート: 1280px, 1024px, 768px, 480px

### 検証結果

| # | ビューポート | 検証項目 | 結果 | 詳細 |
|---|-------------|----------|------|------|
| 1 | 1280px（デスクトップ） | フルナビ（アイコン＋ラベル） | ✅ 合格 | ナビリンクにアイコンとテキストラベルが表示 |
| 2 | 1280px | ハンバーガー非表示 | ✅ 合格 | `hamburger: display: none` |
| 3 | 1280px | テーマ切替ヘッダー内表示 | ✅ 合格 | `themeToggleDesktop: display: flex` |
| 4 | 1280px | 検索バー20rem | ✅ 合格 | `searchWrapper: display: block`, `max-width: 20rem` |
| 5 | 1024px（タブレット） | アイコンのみナビ（ラベル非表示） | ✅ 合格 | `navLinkLabel: display: none`, `navLinkIcon: display: flex` |
| 6 | 1024px | ハンバーガー非表示 | ✅ 合格 | `hamburger: display: none` |
| 7 | 1024px | テーマ切替ヘッダー内表示 | ✅ 合格 | `themeToggleDesktop: display: flex` |
| 8 | 1024px | 検索バー14rem | ✅ 合格 | `searchWrapper: display: block`, `max-width: 14rem` |
| 9 | 768px（タブレット下限） | アイコンのみナビ | ✅ 合格 | `navLinkLabel: display: none`, `navLinkIcon: display: flex` |
| 10 | 768px | ハンバーガー非表示 | ✅ 合格 | `hamburger: display: none` |
| 11 | 768px | テーマ切替ヘッダー内表示 | ✅ 合格 | `themeToggleDesktop: display: flex` |
| 12 | 768px | 検索バー表示 | ✅ 合格 | `searchWrapper: display: block` |
| 13 | 480px（モバイル） | デスクトップナビ非表示 | ✅ 合格 | `desktopNav: display: none` |
| 14 | 480px | ハンバーガー表示・右端 | ✅ 合格 | `hamburger: display: flex`、ヘッダー右端に配置 |
| 15 | 480px | テーマ切替ヘッダー内非表示 | ✅ 合格 | `themeToggleDesktop: display: none` |
| 16 | 480px | 検索バー非表示 | ✅ 合格 | `searchWrapper: display: none` |
| 17 | 480px（メニュー開） | モバイルナビ右からスライドイン | ✅ 合格 | `mobileNav: transform: translateX(0)`, `right: 0` |
| 18 | 480px（メニュー開） | テーマ切替メニュー内表示 | ✅ 合格 | `mobileThemeToggle: display: flex, visibility: visible`、「ライトモード」テキスト表示 |
| 19 | 480px（メニュー開） | ナビ項目表示 | ✅ 合格 | 組織管理、タグ管理、エクスポート/インポート、ヘルプ、ログアウト |
| 20 | 480px（メニュー開） | オーバーレイ表示 | ✅ 合格 | 半透明オーバーレイが背景を覆う |

### CSS検証詳細（`getComputedStyle`による確認）

**1280px（デスクトップ）:**
- `desktopNav: flex` / `hamburger: none` / `themeToggleDesktop: flex` / `searchWrapper: block`

**1024px（タブレット）:**
- `desktopNav: flex` / `hamburger: none` / `themeToggleDesktop: flex` / `searchWrapper: block`
- `navLinkLabel: none` / `navLinkIcon: flex`

**768px（タブレット下限）:**
- `desktopNav: flex` / `hamburger: none` / `themeToggleDesktop: flex` / `searchWrapper: block`

**480px（モバイル・閉じた状態）:**
- `desktopNav: none` / `hamburger: flex` / `themeToggleDesktop: none` / `searchWrapper: none`
- `mobileNav: flex, transform: translateX(280px)`（画面外）

**480px（モバイル・メニュー開）:**
- `mobileNav: flex, transform: translateX(0)`（画面内）
- `mobileThemeToggle: flex, visibility: visible`

### スクリーンショット

| ファイル | 説明 |
|----------|------|
| `docs/screenshots/responsive_1280px.png` | デスクトップ表示（1280px）— フルナビ（アイコン＋テキスト）、検索バー20rem |
| `docs/screenshots/responsive_1024px.png` | タブレット表示（1024px）— アイコンのみナビ、検索バー14rem |
| `docs/screenshots/responsive_768px.png` | タブレット下限（768px）— アイコンのみナビ、検索バー表示 |
| `docs/screenshots/responsive_480px.png` | モバイル表示（480px）— ハンバーガー右端、デスクトップナビ非表示 |
| `docs/screenshots/responsive_480px_menu.png` | モバイルメニュー開（480px）— 右スライドイン、テーマ切替メニュー内 |

---

## 4. 修正ファイル一覧

| ファイル | 変更種別 | 概要 |
|----------|----------|------|
| `frontend/src/components/layout/header.module.scss` | 大幅変更 | 三段階ブレークポイント化、ハンバーガー右端、モバイルナビ右揃え、テーマ切替のレスポンシブ対応 |
| `frontend/src/components/layout/Header.tsx` | 変更 | ナビリンクにアイコン/ラベルspan追加、テーマ切替のデスクトップ/モバイル分離 |

---
---

# 問題5 修正結果: 名刺一覧ページの余白修正

## 修正情報
- 日時: 2026-03-04
- 実施者: Sisyphus-Junior Agent
- 対象: `/namecards` ページの `.page` 要素に余白追加
- 方法: SCSS修正 + Playwright UI検証

---

## 1. 修正結果サマリー

| 項目 | 修正前 | 修正後 |
|------|--------|--------|
| `max-width` | ❌ なし | ✅ `48rem`（768px） |
| `margin` | ❌ `0` | ✅ `$space-8 auto`（32px auto） |
| `padding` | ❌ `0` | ✅ `0 $space-4`（0 16px） |

---

## 2. 修正内容

### 修正ファイル

**ファイル**: `frontend/src/app/(main)/namecards/namecards.module.scss`

```scss
// 修正後
.page {
  max-width: 48rem;
  margin: $space-8 auto;
  padding: 0 $space-4;
  display: flex;
  flex-direction: column;
  gap: $space-6;
}
```

他ページ（tags, relationships, help）と同じ余白パターンに統一。

---

## 3. Playwright UI検証結果

### 検証環境
- Docker コンテナ: frontend (:3000), backend (:8000), db (:5432 healthy) — すべて稼働中
- ビューポート: デフォルト（1280px幅）

### 検証結果

| # | 検証項目 | 結果 | 詳細 |
|---|----------|------|------|
| 1 | `/namecards` ページが正常に表示される | ✅ 合格 | HTTP 200、ソートUIとFAB表示 |
| 2 | `.page` の `max-width` が `768px` | ✅ 合格 | Computed Style: `768px` |
| 3 | `.page` の `margin` が `32px auto` | ✅ 合格 | Computed Style: `32px 256px`（auto中央寄せ） |
| 4 | `.page` の `padding` が `0 16px` | ✅ 合格 | Computed Style: `0px 16px` |
| 5 | タグ管理ページと同じ余白設定 | ✅ 合格 | 両ページのComputed Style値が完全に一致 |

### 他ページとの比較（Computed Styles）

| プロパティ | `/namecards` | `/tags` | 一致 |
|-----------|-------------|---------|------|
| max-width | 768px | 768px | ✅ |
| margin-top | 32px | 32px | ✅ |
| margin-left | 256px (auto) | 256px (auto) | ✅ |
| padding-left | 16px | 16px | ✅ |
| padding-right | 16px | 16px | ✅ |

### スクリーンショット

| ファイル | 説明 |
|----------|------|
| `docs/screenshots/namecards-margin-fixed.png` | 名刺一覧ページ（余白修正後） |

---

## 4. 修正ファイル一覧

| ファイル | 変更種別 | 概要 |
|----------|----------|------|
| `frontend/src/app/(main)/namecards/namecards.module.scss` | 変更 | `.page` に `max-width: 48rem`, `margin: $space-8 auto`, `padding: 0 $space-4` を追加 |
