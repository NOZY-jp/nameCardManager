# 名刺 CRUD・検索 API（Phase 3）

FastAPI と並行稼働する Next.js 側の Route Handlers。認可は `src/lib/auth/guard.ts`（Phase 2）を通し、
未認証は 401 `{"detail":"Not authenticated"}`。実装は `src/lib/namecards/service.ts`。

## エンドポイント

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/api/v1/namecards` | 一覧（`page` / `per_page` / `sort_by` / `order` / `tag_id` / `relationship_id`） |
| POST | `/api/v1/namecards` | 作成（連絡先・画像パス・所属・タグを一括） |
| GET | `/api/v1/namecards/{id}` | 詳細 |
| PATCH | `/api/v1/namecards/{id}` | 部分更新（`contact_methods` は完全置換） |
| DELETE | `/api/v1/namecards/{id}` | 削除（204） |
| GET | `/api/v1/search` | キーワード横断検索（`q` / `tag_ids` / `relationship_ids` / 日付範囲） |

一覧・検索とも `{items,total,page,per_page,total_pages}` を返す。一覧の item は `images` 配列、
検索の item は先頭画像の `image_path`（現行 FastAPI と同じ形）。

## 検索と pg_bigm

- `LIKE`/`ILIKE` はこの PostgreSQL で `pg_bigm.gin_key_like` が未対応のため GIN 索引を使わない（実測: Seq Scan）。
- そのため名刺のテキスト列は **`=%` 演算子**（pg_bigm）で検索する。列ごとに `UNION` して
  `Bitmap Index Scan on ix_name_cards_*_bigm` を使う（`EXPLAIN (ANALYZE, BUFFERS)` で確認）。
- `contact_methods.value` は GIN 索引が無いため `ILIKE`（全走査）。
- **差異**: `=%` は大文字小文字を区別するため、英字の氏名・メモは FastAPI の `ILIKE` と結果が
  変わり得る（日本語は影響なし）。連絡先の検索は従来どおり大小無視。

## 既存 FastAPI との差異

| 項目 | 差異 |
| --- | --- |
| バリデーションエラー | FastAPI/Pydantic は 422 で `detail` が配列。新実装は 422 で `detail` が文字列（メッセージ結合） |
| 検索の英字大小 | 名刺テキストは `=%` のため大小を区別（上記） |
| 削除時の子行 | DB の FK が `NO ACTION` のため、連絡先・画像・中間テーブルをトランザクションで明示削除 |
| updated_at | アプリ側で更新（現行同様。DB トリガーなし） |

## 検証

```bash
cd frontend
pnpm exec tsc --noEmit
pnpm exec vitest --run
pnpm build

# E2E（隔離 PostgreSQL + AUTH_SECRET + SECRET_KEY）
DATABASE_URL=... AUTH_SECRET=dummy SECRET_KEY=dummy \
  pnpm exec playwright test e2e/namecards-api.spec.ts
```
