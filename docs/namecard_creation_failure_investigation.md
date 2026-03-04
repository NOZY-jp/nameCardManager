# 名刺新規作成失敗 - 調査報告

## 問題の説明

名刺の新規作成時、OCR結果がフォームに入力された状態で登録ボタンをクリックすると、**連絡先（contact_methods）が複数ある場合に登録が失敗する**。連絡先が1つだけの場合は成功することがある。

## エラーの詳細

| 項目 | 値 |
|------|-----|
| HTTPステータス | **422 Unprocessable Entity** |
| エラーメッセージ | `Validation error` |
| エラー詳細 | `Input should be 'email', 'tel', 'mobile', 'fax', 'website', 'linkedin', 'twitter', 'facebook', 'instagram', 'line', 'wechat', 'whatsapp', 'telegram', 'skype', 'zoom', 'teams' or 'other'` |
| エラーフィールド | `body -> contact_methods -> {index} -> type` |

### リクエストボディ（再現時）

```json
{
  "first_name": "テスト",
  "last_name": "調査",
  "contact_methods": [
    { "type": "email", "value": "test@example.com", "is_primary": false },
    { "type": "x", "value": "@testuser", "is_primary": false }
  ],
  "relationship_ids": [],
  "tag_ids": []
}
```

### レスポンスボディ

```json
{
  "detail": "Validation error",
  "errors": [
    {
      "field": "body -> contact_methods -> 1 -> type",
      "message": "Input should be 'email', 'tel', 'mobile', 'fax', 'website', 'linkedin', 'twitter', 'facebook', 'instagram', 'line', 'wechat', 'whatsapp', 'telegram', 'skype', 'zoom', 'teams' or 'other'"
    }
  ]
}
```

## 根本原因

**フロントエンドとバックエンドで連絡先タイプ（`ContactMethodType`）の定義が一致していない。**

### フロントエンドの定義

ファイル: `frontend/src/lib/schemas/contact-method.ts`

```typescript
export const CONTACT_METHOD_TYPES = [
  "email", "tel", "mobile", "fax", "website",
  "x", "instagram", "youtube", "discord", "booth",
  "github", "linkedin", "facebook", "line", "tiktok",
  "address", "other",
] as const;
```

### バックエンドの定義

ファイル: `backend/app/schemas/__init__.py`

```python
class ContactMethodType(StrEnum):
    email = "email"
    tel = "tel"
    mobile = "mobile"
    fax = "fax"
    website = "website"
    linkedin = "linkedin"
    twitter = "twitter"
    facebook = "facebook"
    instagram = "instagram"
    line = "line"
    wechat = "wechat"
    whatsapp = "whatsapp"
    telegram = "telegram"
    skype = "skype"
    zoom = "zoom"
    teams = "teams"
    other = "other"
```

### 差分

| フロントエンドのみ（バックエンドで拒否される） | バックエンドのみ（フロントエンドで選択不可） |
|----------------------------------------------|---------------------------------------------|
| `x` | `twitter` |
| `youtube` | `wechat` |
| `discord` | `whatsapp` |
| `booth` | `telegram` |
| `github` | `skype` |
| `tiktok` | `zoom` |
| `address` | `teams` |

### なぜ「複数の連絡先で失敗」と報告されるか

- OCRが名刺から複数の連絡先を抽出する際、`email` や `tel` 以外のタイプ（例: `x`, `github` 等）を含むことが多い
- 連絡先が1つだけの場合、そのタイプが `email` や `tel` など両方に存在するタイプであれば成功する
- 2つ以上の連絡先がある場合、いずれかにフロントエンド固有のタイプが含まれる確率が上がるため、「複数だと失敗する」と見える
- **正確には「連絡先の数」ではなく「連絡先のタイプの不一致」が原因**

## 修正案

### 案1: フロントエンドとバックエンドの定義を統一する（推奨）

**両方の定義を同じリストに揃える。** フロントエンドで追加された新しいSNS等のタイプ（`x`, `github`, `youtube` 等）をバックエンドにも追加し、バックエンドにしかないタイプ（`twitter`, `wechat` 等）をフロントエンドにも追加する。

#### 修正対象ファイル:
1. **`backend/app/schemas/__init__.py`** - `ContactMethodType` enum に `x`, `youtube`, `discord`, `booth`, `github`, `tiktok`, `address` を追加
2. **`frontend/src/lib/schemas/contact-method.ts`** - `CONTACT_METHOD_TYPES` に `twitter`, `wechat`, `whatsapp`, `telegram`, `skype`, `zoom`, `teams` を追加（必要に応じて）

#### 工数: Quick（30分以内）

### 案2: バックエンドの型チェックを緩くする

`ContactMethodType` の enum バリデーションを除去し、`type` フィールドを自由文字列にする。

- メリット: 将来の拡張が容易
- デメリット: 不正な値が入る可能性がある

### 案3: `twitter` → `x` のマイグレーション

`twitter` を `x` にリネームする。既存データのマイグレーションも必要。

- `twitter` が旧名称、`x` が新名称なので、`x` に統一する方が将来的
- 既存の `twitter` データを `x` に変換するDBマイグレーションが必要

## 再現手順

1. `http://localhost:3000/login` でログイン
2. `http://localhost:3000/namecards/new` にアクセス
3. 「手入力」または画像アップロード→OCR完了でフォームを表示
4. 姓・名を入力
5. 「連絡先を追加」で2つ以上の連絡先を追加
6. 2つ目の連絡先のタイプを `x`, `youtube`, `discord`, `booth`, `github`, `tiktok`, `address` のいずれかに設定
7. 「登録」をクリック → **422エラーで失敗**

## バックエンドログ

```
POST /api/v1/namecards -> 422 (2.2ms)
```

（Pydantic バリデーションエラーのため、SQLAlchemy レベルのエラーは発生しない）
