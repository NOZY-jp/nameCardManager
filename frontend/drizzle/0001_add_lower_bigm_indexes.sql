-- 大文字小文字を無視した pg_bigm 検索のための関数インデックス。
--
-- 背景: この PostgreSQL の pg_bigm 1.2 は `pg_bigm.gin_key_like` が未対応で、
-- LIKE/ILIKE では GIN 索引が使われない。`lower(col) =% lower($1)` で索引を使うため、
-- lower() 式に bigm_gin_ops の GIN 索引を追加する。
-- 適用範囲: 新規環境のみ。本番 DB へは Phase 6 以降、人の承認後に適用する。

CREATE INDEX "ix_name_cards_first_name_lower_bigm"
  ON "name_cards" USING gin (lower("first_name") gin_bigm_ops);
--> statement-breakpoint
CREATE INDEX "ix_name_cards_last_name_lower_bigm"
  ON "name_cards" USING gin (lower("last_name") gin_bigm_ops);
--> statement-breakpoint
CREATE INDEX "ix_name_cards_first_name_kana_lower_bigm"
  ON "name_cards" USING gin (lower("first_name_kana") gin_bigm_ops);
--> statement-breakpoint
CREATE INDEX "ix_name_cards_last_name_kana_lower_bigm"
  ON "name_cards" USING gin (lower("last_name_kana") gin_bigm_ops);
--> statement-breakpoint
CREATE INDEX "ix_name_cards_notes_lower_bigm"
  ON "name_cards" USING gin (lower("memo") gin_bigm_ops);
--> statement-breakpoint
CREATE INDEX "ix_name_cards_met_notes_lower_bigm"
  ON "name_cards" USING gin (lower("met_notes") gin_bigm_ops);
