# `/namecards` ページ重複要素調査レポート

## 調査情報
- 日時: 2026-03-02
- 調査者: Sisyphus-Junior Agent
- 対象: `/namecards` ページの重複UI要素

---

## 現状のUI構造

`/namecards` ページは以下のレイアウトで構成される:

```
layout.tsx (frontend/src/app/(main)/layout.tsx)
├── <Header />        ← components/layout/Header.tsx
│   ├── ブランドロゴ「名刺管理」
│   ├── デスクトップナビ (.desktopNav)
│   │   ├── 「名刺一覧」リンク → /namecards     ← 重複①
│   │   ├── 「新規登録」ボタン → /namecards/new  ← 重複②
│   │   ├── 「組織管理」リンク
│   │   ├── 「タグ管理」リンク
│   │   ├── 「エクスポート/インポート」リンク
│   │   └── 「ヘルプ」リンク
│   ├── テーマ切替・ログアウト
│   └── モバイルナビ (.mobileNav) ← 同じNAV_ITEMSを表示
│
└── <main>
    └── NameCardsPage (app/(main)/namecards/page.tsx)
        ├── <h1>「名刺一覧」</h1>              ← 重複①
        ├── 「新規登録」ボタン → /namecards/new  ← 重複②
        └── <NameCardList />
```

---

## 重複要素の特定

### 重複① 「名刺一覧」テキスト

| 出現箇所 | ファイル | 行番号 | 実装 |
|----------|---------|--------|------|
| ヘッダーナビ | `frontend/src/components/layout/Header.tsx` | **L33** | `NAV_ITEMS` 配列内 `{ href: "/namecards", label: "名刺一覧", icon: <CreditCard /> }` |
| ページ見出し | `frontend/src/app/(main)/namecards/page.tsx` | **L35** | `<h1 className={styles.pageTitle}>名刺一覧</h1>` |

**性質の違い**:
- ヘッダー側: ナビゲーションリンク（他ページからの遷移用）
- ページ側: ページ見出し（`<h1>` — 現在のページを示す）

### 重複② 「新規登録」ボタン

| 出現箇所 | ファイル | 行番号 | 実装 |
|----------|---------|--------|------|
| ヘッダーナビ | `frontend/src/components/layout/Header.tsx` | **L34-38** | `NAV_ITEMS` 配列内 `{ href: "/namecards/new", label: "新規登録", icon: <Plus />, isPrimary: true }` |
| ページ内 | `frontend/src/app/(main)/namecards/page.tsx` | **L36-39** | `<Link href="/namecards/new" className={styles.newButton}><Plus size={18} />新規登録</Link>` |

**性質の違い**:
- ヘッダー側: グローバルナビの主要アクション（全ページ共通で表示、`.primaryLink` スタイル）
- ページ側: ページ固有のアクションボタン（ページヘッダー内、`.newButton` スタイル）

---

## 問題点

### ユーザー視点
`/namecards` ページを表示すると、**同じ画面に「名刺一覧」が2箇所、「新規登録」が2箇所**表示される。ヘッダーナビとページ内のコンテンツが視覚的に重複し、冗長なUIになっている。

### 技術的詳細
- `Header.tsx` の `NAV_ITEMS` (L32-52) はグローバルナビとして**全ページ共通**で表示される
- `page.tsx` の `pageHeader` (L34-40) は `/namecards` ページ固有の要素
- デスクトップ幅 (`min-width: $bp-lg`) では**両方が同時に表示**される
- モバイル幅ではデスクトップナビが `display: none` になるため、ページ側の要素のみが表示される（モバイルメニューは手動展開）

---

## 修正案

### 案A: ページ側の重複要素を削除（推奨 — Quick）

ヘッダーナビに「名刺一覧」「新規登録」が常にあるため、ページ内の見出しとボタンを削除する。

**修正ファイル**: `frontend/src/app/(main)/namecards/page.tsx`

```tsx
// 修正前 (L32-40)
return (
  <div className={styles.page}>
    <div className={styles.pageHeader}>
      <h1 className={styles.pageTitle}>名刺一覧</h1>
      <Link href="/namecards/new" className={styles.newButton}>
        <Plus size={18} />
        新規登録
      </Link>
    </div>

    <NameCardList ... />
  </div>
);

// 修正後
return (
  <div className={styles.page}>
    <NameCardList ... />
  </div>
);
```

**メリット**: シンプル、重複が完全に解消
**デメリット**: `<h1>` を失うためアクセシビリティ・SEOに影響。モバイルではページ内に「新規登録」の導線がなくなる

### 案B: ヘッダーナビからページ固有要素を外す（Medium）

ヘッダーの `NAV_ITEMS` から「名刺一覧」「新規登録」を除外し、各ページの責務として実装する。

**修正ファイル**: `frontend/src/components/layout/Header.tsx`

```tsx
// 修正前 (L32-39)
const NAV_ITEMS: NavItem[] = [
  { href: "/namecards", label: "名刺一覧", icon: <CreditCard size={16} /> },
  { href: "/namecards/new", label: "新規登録", icon: <Plus size={16} />, isPrimary: true },
  ...
];

// 修正後
const NAV_ITEMS: NavItem[] = [
  { href: "/namecards", label: "名刺一覧", icon: <CreditCard size={16} /> },
  // 「新規登録」をグローバルナビから削除（各ページ内で提供）
  ...
];
```

**メリット**: ページ側の `<h1>` とアクションボタンを維持でき、アクセシビリティが保たれる
**デメリット**: 他ページから `/namecards/new` へのショートカットが失われる

### 案C: 現在ページにいる場合は非表示（Medium）

ヘッダーのナビで、現在の `/namecards` ページにいるときは「名刺一覧」リンクと「新規登録」ボタンのスタイルを調整する（例: active状態を強調しつつページ側をプライマリとする）。

**修正ファイル**: `frontend/src/components/layout/Header.tsx` + CSS

```tsx
// Header.tsx 内で pathname に基づく条件分岐
// /namecards にいるときは「新規登録」を desktopNav から非表示にする
{NAV_ITEMS.map((item) => {
  // /namecards ページにいるときは isPrimary リンクを非表示
  if (item.isPrimary && pathname === "/namecards") return null;
  ...
})}
```

**メリット**: 状況に応じた最適なUI、両方の導線を活かせる
**デメリット**: 条件分岐の複雑性が増す

### 推奨

**案B** を推奨。理由:
1. ページの `<h1>` を保持しアクセシビリティを維持
2. 「新規登録」はページのコンテキスト内にある方が自然
3. ヘッダーナビは「名刺一覧」リンクのみ残し、ナビゲーション目的に特化させる
4. 変更箇所が `Header.tsx` の `NAV_ITEMS` 配列1行のみで影響範囲が小さい

---

*調査完了日時: 2026年3月2日*
*調査者: Sisyphus-Junior Agent（コード調査のみ、修正なし）*

---

# ダークモード切り替えボタンの初期表示問題

## 調査情報
- 日時: 2026-03-02
- 調査者: Sisyphus-Junior Agent
- 対象: テーマ切り替えボタンの初期アイコンが実際のテーマと不一致

---

## 現象

- ページのデフォルト表示は**ダークモード**（OSのダークモード設定に従う）
- しかし切り替えボタンの初期表示は **`<Moon />`（ダークモードに切り替え）** になっている
- ユーザーは既にダークモードなのに「ダークモードに切り替え」のアイコンを見る
- 結果: **2回クリック**しないとライトモードに切り替わらない
  - 1回目: `theme` が `"system"` → `"light"` に変更（ライトモードへ）… のはずだが `toggleTheme` のロジック上 `"system" !== "dark"` なので `"dark"` に設定される
  - 2回目: `theme` が `"dark"` → `"light"` に変更（正常動作）

---

## 原因

### 根本原因: `theme` と `resolvedTheme` の混同

2つのファイルの相互作用が問題を起こしている:

### 1. ThemeProvider の設定

**ファイル**: `frontend/src/app/providers.tsx` **L11**

```tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
```

- `defaultTheme="system"` — 初期テーマは `"system"`（OS設定に委譲）
- `enableSystem` — OS のカラースキーム設定を検出する
- OSがダークモードの場合、**実際の表示はダークモード**だが、`theme` の値は `"system"` のまま

### 2. アイコン判定ロジック

**ファイル**: `frontend/src/components/layout/Header.tsx` **L55, L63-65, L135**

```tsx
// L55
const { theme, setTheme } = useTheme();

// L63-65: トグルロジック
const toggleTheme = () => {
  setTheme(theme === "dark" ? "light" : "dark");
};

// L135: アイコン判定
{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
```

### 問題の流れ

| ステップ | `theme` の値 | 実際の表示 | アイコン | ユーザーの期待 |
|---------|-------------|-----------|---------|-------------|
| 初期表示 | `"system"` | ダークモード（OS設定） | `<Moon />` (🌙) | `<Sun />` (☀️) であるべき |
| 1回目クリック | `"system" !== "dark"` → `setTheme("dark")` | ダークモード（変化なし） | `<Sun />` (☀️) | ライトモードに切り替わるべき |
| 2回目クリック | `"dark" === "dark"` → `setTheme("light")` | ライトモード | `<Moon />` (🌙) | ✅ 正常 |

**核心**: `theme` は `"system"` | `"light"` | `"dark"` の **3値** を返すが、アイコン判定とトグルロジックは `"dark"` のみを特別扱いしている。OSがダークモードでも `theme === "system"` なので、ダークモードと判定されない。

---

## 該当ファイル・行番号

| ファイル | 行番号 | 内容 |
|---------|--------|------|
| `frontend/src/app/providers.tsx` | **L11** | `defaultTheme="system"` — テーマ初期値が `"system"` |
| `frontend/src/components/layout/Header.tsx` | **L55** | `const { theme, setTheme } = useTheme()` — `resolvedTheme` を取得していない |
| `frontend/src/components/layout/Header.tsx` | **L63-65** | `toggleTheme` — `theme === "dark"` で判定（`"system"` を考慮していない） |
| `frontend/src/components/layout/Header.tsx` | **L135** | アイコン表示 — `theme === "dark"` で判定（同上） |

---

## 修正案

### 案A: `resolvedTheme` を使用する（推奨 — Quick）

`next-themes` の `useTheme()` は `resolvedTheme` も返す。これは `"system"` を実際のテーマ値（`"dark"` or `"light"`）に解決した値。

**修正ファイル**: `frontend/src/components/layout/Header.tsx`

```tsx
// 修正前 (L55)
const { theme, setTheme } = useTheme();

// 修正後
const { resolvedTheme, setTheme } = useTheme();
```

```tsx
// 修正前 (L63-65)
const toggleTheme = () => {
  setTheme(theme === "dark" ? "light" : "dark");
};

// 修正後
const toggleTheme = () => {
  setTheme(resolvedTheme === "dark" ? "light" : "dark");
};
```

```tsx
// 修正前 (L135)
{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}

// 修正後
{resolvedTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
```

**メリット**:
- 変更箇所が3箇所のみ（変数名の変更）
- `"system"` テーマでも実際の表示に対応したアイコンが表示される
- `defaultTheme="system"` の設定はそのまま維持でき、OS設定追従機能を失わない

**デメリット**:
- なし（`resolvedTheme` は `next-themes` の正規APIであり、この用途に最適）

### 案B: `defaultTheme` を `"dark"` に変更する（Quick だが非推奨）

**修正ファイル**: `frontend/src/app/providers.tsx`

```tsx
// 修正前 (L11)
<ThemeProvider attribute="class" defaultTheme="system" enableSystem>

// 修正後
<ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
```

**メリット**: Header.tsx の変更不要
**デメリット**: OS設定がライトモードのユーザーにも常にダークモードが初期表示される（ユーザー体験の低下）

### 推奨

**案A** を推奨。理由:
1. `resolvedTheme` は `next-themes` が提供する正規の解決済みテーマ値であり、この問題を解決するために設計されたもの
2. OS設定追従（`defaultTheme="system"`）を維持できる
3. 変更量が最小（3箇所の変数名変更のみ）
4. 初期表示・トグル動作の両方が正しくなる

---

*調査完了日時: 2026年3月2日*
*調査者: Sisyphus-Junior Agent（コード調査のみ、修正なし）*

---

# OCR機能の導線問題調査レポート

## 調査情報
- 日時: 2026-03-02
- 調査者: Sisyphus-Junior Agent
- 対象: 名刺登録時のOCR機能への導線が破綻している問題

---

## 期待されるフロー

```
1. 画像から名刺を登録（ユーザーが選択）
2. 画像を選択 or 写真を撮影
3. 四隅を選択（CornerSelector）
4. OCRの結果から名刺の情報を仮入力
5. ユーザーが本入力（NameCardForm）
6. 登録
```

---

## 現状の実装状況

### コンポーネント一覧

| コンポーネント | ファイル | 状態 | 役割 |
|---------------|---------|------|------|
| `ImageUploadOCR` | `frontend/src/components/camera/ImageUploadOCR.tsx` | ✅ 実装済 | 画像アップロード → 四隅選択 → OCR |
| `CameraOCRFlow` | `frontend/src/components/camera/CameraOCRFlow.tsx` | ✅ 実装済 | カメラ撮影 → 四隅選択 → OCR |
| `CameraCapture` | `frontend/src/components/camera/CameraCapture.tsx` | ✅ 実装済 | カメラ映像表示・撮影 |
| `CornerSelector` | `frontend/src/components/camera/CornerSelector.tsx` | ✅ 実装済 | 四隅のドラッグ選択UI |
| `NameCardForm` | `frontend/src/components/namecard/NameCardForm.tsx` | ✅ 実装済 | 名刺情報入力フォーム（`defaultValues` 受取可） |
| バックエンドAPI | `backend/app/api/v1/endpoints/images.py` | ✅ 実装済 | `/images/upload` + `/images/process` |
| フロントAPI | `frontend/src/lib/api/images.ts` | ✅ 実装済 | `imageApi.upload()` + `imageApi.process()` |

### `/namecards/new` ページの現在構造

```
NewNameCardPage (app/(main)/namecards/new/page.tsx)
├── header (戻るリンク + タイトル)
├── ocrSection
│   └── <ImageUploadOCR onComplete={handleOCRComplete} />  ← ✅ 統合済
└── formContainer
    ├── <NameCardForm key={formKey} defaultValues={ocrDefaults} />
    └── キャンセルボタン
```

---

## 問題点の特定

### 問題① `CameraOCRFlow` が未使用（カメラ撮影経路が死んでいる）

**重要度**: 🔴 高

`CameraOCRFlow` コンポーネントは実装済みだが、**どこからもインポート・使用されていない**。

| 検索対象 | 結果 |
|---------|------|
| `import.*CameraOCRFlow` でプロジェクト全体を検索 | `CameraOCRFlow.tsx` 自身と `index.ts` の export のみ |
| `page.tsx` のインポート | `ImageUploadOCR` のみ（**L7**） |

**該当ファイル**: `frontend/src/app/(main)/namecards/new/page.tsx` **L7, L84-86**

```tsx
// L7: ImageUploadOCR のみインポート — CameraOCRFlow のインポートがない
import { ImageUploadOCR } from "@/components/camera";

// L84-86: ImageUploadOCR のみ配置 — カメラ撮影の導線がない
<div className={styles.ocrSection}>
  <ImageUploadOCR onComplete={handleOCRComplete} />
</div>
```

**影響**: 期待フローの「写真を撮影」の経路が存在しない。ユーザーは画像ファイルのアップロードのみ可能で、その場でカメラ撮影することができない。

### 問題② `ImageUploadOCR` にカメラ撮影ボタンがない

**重要度**: 🔴 高

`ImageUploadOCR` コンポーネント（**L146-176**）の idle 状態では、ファイルアップロードボタンのみ表示される:

```tsx
// ImageUploadOCR.tsx L160-174
<div className={styles.uploadActions}>
  <Button type="button" variant="outline" onClick={handleUploadClick}>
    <Upload size={18} />
    画像をアップロード
  </Button>
  <p className={styles.uploadHint}>
    <Camera size={14} />   ← Camera アイコンは使っているが、ただのヒントテキスト
    名刺の画像を選択すると、OCRで自動入力します
  </p>
</div>
```

`Camera` アイコンはインポートされている（**L3**）が、**ヒントテキストの装飾としてのみ使用**されており、カメラ撮影を起動するボタンではない。

**該当ファイル**: `frontend/src/components/camera/ImageUploadOCR.tsx` **L3, L160-174**

### 問題③ 「画像から名刺を登録」という選択肢がない

**重要度**: 🟡 中

`/namecards/new` ページにアクセスすると、OCRセクションとフォームが**両方同時に表示**される。ユーザーに「画像から登録するか、手入力するか」の選択を明示的に促すUIがない。

現在のフローは暗黙的に「アップロードしたければOCRセクションを使う、しなければそのままフォームを入力する」という設計だが、OCRセクションが目立たない（点線ボーダーの枠内にボタンが1つあるだけ）ため、ユーザーがOCR機能の存在に気づかない可能性がある。

**該当ファイル**: `frontend/src/app/(main)/namecards/new/page.tsx` **L74-105**

---

## フロー破綻箇所の図解

```
期待フロー:
  [1. 画像から名刺を登録] → [2a. 画像を選択] → [3. 四隅選択] → [4. OCR] → [5. フォーム入力] → [6. 登録]
                          → [2b. 写真を撮影]  → [3. 四隅選択] → [4. OCR] → [5. フォーム入力] → [6. 登録]

現状:
  [1. ???]    → [2a. 画像アップロード（ボタンが地味で気づきにくい）] → [3. 四隅選択] → [4. OCR] → [5. フォーム入力] → [6. 登録]
  ↑ 選択UIなし    [2b. 写真を撮影] ← ❌ 導線なし（CameraOCRFlowが未接続）
```

**破綻箇所**:
1. **ステップ1**: 「画像から名刺を登録」という明示的な選択肢がない
2. **ステップ2b**: カメラ撮影の導線が完全に欠落（`CameraOCRFlow` が dead code）
3. **ステップ2a**: 画像アップロードのUIが控えめで発見性が低い

---

## 修正案

### 案A: `ImageUploadOCR` にカメラ撮影ボタンを追加し、`CameraOCRFlow` を統合する（推奨 — Medium）

`ImageUploadOCR` コンポーネントの idle 状態に「カメラで撮影」ボタンを追加し、クリック時に `CameraOCRFlow` をインライン表示する。

**修正ファイル**: `frontend/src/components/camera/ImageUploadOCR.tsx`

```tsx
// 修正イメージ（差分のみ）

import { CameraOCRFlow } from "./CameraOCRFlow";  // ← 追加

type FlowStep = "idle" | "camera" | "corners" | "processing";  // ← "camera" 追加

// idle state のレンダリング部分を修正（L146-176）
return (
  <div className={styles.uploadArea}>
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      onChange={handleFileSelect}
      className={styles.hiddenInput}
    />

    {error && <p className={styles.errorInline}>{error}</p>}

    <div className={styles.uploadActions}>
      <Button type="button" variant="outline" onClick={handleUploadClick}>
        <Upload size={18} />
        画像をアップロード
      </Button>
      <Button type="button" variant="outline" onClick={() => setStep("camera")}>
        <Camera size={18} />
        カメラで撮影
      </Button>
      <p className={styles.uploadHint}>
        名刺の画像を選択またはカメラで撮影すると、OCRで自動入力します
      </p>
    </div>
  </div>
);

// step === "camera" のレンダリングを追加（handleCornersConfirm の前あたりに挿入）
if (step === "camera") {
  return (
    <CameraOCRFlow
      onComplete={(data) => {
        setStep("idle");
        onComplete(data);
      }}
      onCancel={() => setStep("idle")}
    />
  );
}
```

**メリット**:
- 既存コンポーネント（`CameraOCRFlow`）をそのまま活用でき、新規実装が不要
- `ImageUploadOCR` が画像アップロードとカメラ撮影の両方の入口を提供するため、`page.tsx` の変更不要
- 期待フローのステップ2a/2bの両方が実現される

**デメリット**:
- `ImageUploadOCR` の責務が広がる（名前と合わなくなる — `NameCardOCR` 等にリネーム推奨）

### 案B: `page.tsx` でタブ/モード切り替えUIを追加する（Medium）

`/namecards/new` ページに「手入力 / 画像アップロード / カメラ撮影」のタブを追加し、モードに応じてOCRセクションの表示を切り替える。

**修正ファイル**: `frontend/src/app/(main)/namecards/new/page.tsx`

```tsx
// 修正イメージ
const [ocrMode, setOcrMode] = useState<"none" | "upload" | "camera">("none");

return (
  <div className={styles.page}>
    {/* ... header ... */}

    <div className={styles.ocrModeSelector}>
      <Button variant={ocrMode === "none" ? "default" : "outline"}
              onClick={() => setOcrMode("none")}>
        手入力
      </Button>
      <Button variant={ocrMode === "upload" ? "default" : "outline"}
              onClick={() => setOcrMode("upload")}>
        画像から入力
      </Button>
      <Button variant={ocrMode === "camera" ? "default" : "outline"}
              onClick={() => setOcrMode("camera")}>
        カメラで撮影
      </Button>
    </div>

    {ocrMode === "upload" && (
      <div className={styles.ocrSection}>
        <ImageUploadOCR onComplete={handleOCRComplete} />
      </div>
    )}

    {ocrMode === "camera" && (
      <div className={styles.ocrSection}>
        <CameraOCRFlow onComplete={handleOCRComplete}
                       onCancel={() => setOcrMode("none")} />
      </div>
    )}

    <div className={styles.formContainer}>
      <NameCardForm ... />
    </div>
  </div>
);
```

**メリット**:
- 期待フローの全ステップが明示的に表現される
- ユーザーに「画像から名刺を登録」の選択肢を明確に提示できる

**デメリット**:
- ページレベルのUI変更が必要でSCSS追加もある
- モード切り替えの状態管理が増える

### 推奨

**案A** を推奨。理由:
1. 変更が `ImageUploadOCR.tsx` 1ファイルに集約される
2. `CameraOCRFlow`（dead code）をそのまま活用でき、新規コード量が最小
3. `page.tsx` の変更不要で影響範囲が小さい
4. 画像アップロードボタンの横にカメラボタンを置く自然なUI配置

---

## 関連ファイル・行番号一覧

| ファイル | 行番号 | 問題 |
|---------|--------|------|
| `frontend/src/app/(main)/namecards/new/page.tsx` | **L7** | `CameraOCRFlow` のインポートがない |
| `frontend/src/app/(main)/namecards/new/page.tsx` | **L84-86** | `ImageUploadOCR` のみ配置、カメラ導線なし |
| `frontend/src/components/camera/ImageUploadOCR.tsx` | **L3** | `Camera` アイコンをインポートしているがボタンに未使用 |
| `frontend/src/components/camera/ImageUploadOCR.tsx` | **L15** | `FlowStep` に `"camera"` がない |
| `frontend/src/components/camera/ImageUploadOCR.tsx` | **L160-174** | idle 状態でファイルアップロードのみ、カメラ撮影ボタンなし |
| `frontend/src/components/camera/CameraOCRFlow.tsx` | **全体** | 完全に dead code — どこからもインポートされていない |
| `frontend/src/components/camera/index.ts` | **L2** | `CameraOCRFlow` をエクスポートしているが消費者なし |

---

*調査完了日時: 2026年3月2日*
*調査者: Sisyphus-Junior Agent（コード調査のみ、修正なし）*

---

# `/namecards` ページ重複要素修正結果

## 修正情報
- 日時: 2026-03-02
- 修正者: Sisyphus-Junior Agent
- 対象: ヘッダーナビゲーションの「新規登録」重複削除

---

## 実施した修正（案B）

### 変更ファイル: `frontend/src/components/layout/Header.tsx`

1. `NAV_ITEMS` 配列から「新規登録」エントリを削除
2. 未使用になった `Plus` アイコンの import を削除

```tsx
// 修正前
const NAV_ITEMS: NavItem[] = [
  { href: "/namecards", label: "名刺一覧", icon: <CreditCard size={16} /> },
  { href: "/namecards/new", label: "新規登録", icon: <Plus size={16} />, isPrimary: true },
  { href: "/relationships", label: "組織管理", icon: <FolderTree size={16} /> },
  // ...
];

// 修正後
const NAV_ITEMS: NavItem[] = [
  { href: "/namecards", label: "名刺一覧", icon: <CreditCard size={16} /> },
  { href: "/relationships", label: "組織管理", icon: <FolderTree size={16} /> },
  // ...
];
```

---

## Playwright テスト結果

### テスト環境
- Docker コンテナ: db, backend, frontend すべて起動済み
- フロントエンド: `docker compose up -d --build` でリビルド済み

### デスクトップビュー (1280x800)

| 確認項目 | 結果 | 詳細 |
|---------|------|------|
| ヘッダーナビに「名刺一覧」リンク | ✅ あり | `/namecards` へのリンク |
| ヘッダーナビに「新規登録」リンク | ✅ なし | 削除済み |
| ヘッダーナビに「組織管理」リンク | ✅ あり | `/relationships` へのリンク |
| ヘッダーナビに「タグ管理」リンク | ✅ あり | `/tags` へのリンク |
| ヘッダーナビに「エクスポート/インポート」リンク | ✅ あり | `/import-export` へのリンク |
| ヘッダーナビに「ヘルプ」リンク | ✅ あり | `/help` へのリンク |
| ページ内 `<h1>` 「名刺一覧」 | ✅ あり | `heading "名刺一覧" [level=1]` |
| ページ内「新規登録」ボタン | ✅ あり | `/namecards/new` へのリンク |

### モバイルビュー (375x800)

| 確認項目 | 結果 | 詳細 |
|---------|------|------|
| モバイルナビに「名刺一覧」リンク | ✅ あり | |
| モバイルナビに「新規登録」リンク | ✅ なし | 削除済み |
| モバイルナビに他のナビ項目 | ✅ あり | 組織管理、タグ管理、エクスポート/インポート、ヘルプ |
| ページ内 `<h1>` 「名刺一覧」 | ✅ あり | |
| ページ内「新規登録」ボタン | ✅ あり | |

---

## 結論

案Bの修正により:
- ヘッダーナビゲーションから「新規登録」の重複表示が解消された
- ページ側の `<h1>` 見出しと「新規登録」ボタンは維持され、アクセシビリティが保たれている
- デスクトップ・モバイル両方で正しく動作することを確認済み

*修正完了日時: 2026年3月2日*
*修正者: Sisyphus-Junior Agent*

---

# ヘッダーと名刺一覧ページUI改善（再修正）

## 修正情報
- 日時: 2026-03-02
- 修正者: Sisyphus-Junior Agent
- 対象: ヘッダーUI再修正（ユーザー要望に基づく）

---

## ユーザー要望
1. ヘッダーから「名刺一覧」ナビ項目を削除（ダサい）
2. ヘッダーに「新規登録」を戻す（前回削除したので）
3. 「新規登録」は「+」マークのみの表示に変更
4. ページ側の「名刺一覧」見出しと「新規登録」ボタンは削除

---

## 実施した修正

### 変更ファイル

#### 1. `frontend/src/components/layout/Header.tsx`
- `NAV_ITEMS` から「名刺一覧」エントリを削除
- `CreditCard` アイコンのインポートを `Plus` に変更
- actions エリア（ヘッダー右側）に `/namecards/new` への丸型「+」ボタンを追加

#### 2. `frontend/src/components/layout/header.module.scss`
- `.addButton` スタイルを追加（丸型、アクセントカラー、ホバーエフェクト）

#### 3. `frontend/src/app/(main)/namecards/page.tsx`
- `pageHeader`（見出し `<h1>名刺一覧</h1>` + 新規登録ボタン）を削除
- 未使用の `Plus`, `Link` インポートを削除

#### 4. `frontend/src/app/(main)/namecards/namecards.module.scss`
- `.pageHeader`, `.pageTitle`, `.newButton` の未使用スタイルを削除

---

## Playwright テスト結果

### テスト環境
- Docker コンテナ: db, backend, frontend すべて起動済み
- フロントエンド: `docker compose up -d --build` でリビルド済み

### テスト1: アクセシビリティスナップショット確認

| 確認項目 | 結果 | 詳細 |
|---------|------|------|
| ヘッダーに「名刺一覧」ナビ項目 | ✅ なし | 削除済み |
| ヘッダーに「+」アイコン（新規登録） | ✅ あり | `link "新規登録"` → `/namecards/new` |
| ページ内に「名刺一覧」見出し | ✅ なし | 削除済み |
| ページ内に「新規登録」ボタン | ✅ なし | 削除済み |
| モバイルナビに「名刺一覧」 | ✅ なし | 削除済み |
| 空状態メッセージ | ✅ あり | 「名刺がありません」表示 |

### テスト2: スクリーンショット目視確認
- **結果**: PASS
- ヘッダー: 「名刺管理」ロゴ → ピンク色の丸い「+」ボタン → テーマ切替 → ログアウト → ハンバーガーメニュー
- ページコンテンツ: 空状態メッセージ「名刺がありません」のみ

### テスト3: 「+」ボタンのナビゲーション確認
- **結果**: PASS
- 「+」ボタンクリック → `/namecards/new` に正常遷移
- 新規登録フォームが正しく表示される

---

## スクリーンショット
- `docs/screenshot_namecards_v3.png`

---

*修正完了日時: 2026年3月2日*
*修正者: Sisyphus-Junior Agent*
