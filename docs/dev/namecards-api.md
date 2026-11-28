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

一覧・検索とも `{items,total,page,per_page,total_pages}` を返す。検索の `total` は items とは別に
同じ WHERE で数える（結果 0 件の範囲外ページでも総件数を返すため）。一覧の item は `images` 配列、
検索の item は先頭画像の `image_path`（現行 FastAPI と同じ形）。

## 検索と pg_bigm

- `LIKE`/`ILIKE` はこの PostgreSQL で `pg_bigm.gin_key_like` が未対応のため GIN 索引を使わない（実測: Seq Scan）。
- 名刺のテキスト列は **`lower(col) =% lower($1)`** で検索する。`0001_add_lower_bigm_indexes.sql` が
  `lower(col)` の GIN 索引（`gin_bigm_ops`）を追加し、列ごとに `UNION` して
  `Bitmap Index Scan on ix_name_cards_*_lower_bigm` を使う。大小無視・かなカナ相互一致を維持する。
- `contact_methods.value` は GIN 索引が無いため `ILIKE`（全走査）。
- `=%` はワイルドカード不要の部分一致（`LIKE '%kw%'` 相当）。検索語に含まれる `%` / `_` は
  **ワイルドカードとして扱われない**（全件一致にはならない）。記号自体を文字として一致させる
  検索は pg_bigm の 2-gram 制約で一致しない場合がある（既存 `ILIKE` からの挙動差）。
- ダミー 23 万件での実測: `lower(last_name) =% lower('rare')` → `Bitmap Index Scan on
  ix_name_cards_last_name_lower_bigm`、Execution 5.4ms。`lower(last_name) =% lower('tanaka')`
  （3万件ヒット）でも同 Index Scan で 30.3ms。`ILIKE` は Seq Scan。

## 既存 FastAPI との差異

| 項目 | 差異 |
| --- | --- |
| バリデーションエラー | 既存は 422 `{"detail":[{loc,msg,type},…]}`。新実装も配列で返す（`type` の値は Zod 由来で Pydantic と一部異なる） |
| 検索の英字大小 | 既存と同じく大小無視（`lower()` の関数インデックスで GIN を使用）。`%`/`_` は文字扱い |
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
