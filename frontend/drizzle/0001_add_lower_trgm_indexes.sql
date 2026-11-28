-- 大文字小文字を無視した部分一致検索のための関数インデックス（pg_trgm）。
--
-- 背景: この PostgreSQL の pg_bigm 1.2 は `pg_bigm.gin_key_like` が未対応で LIKE/ILIKE に
-- GIN 索引が使えない。`=%` は類似度演算子で部分一致にならないため、旧来の ILIKE と同じ
-- 部分一致を索引付きで実現するために pg_trgm の GIN 索引（gin_trgm_ops）を使う。
-- 適用範囲: 新規環境のみ。本番 DB へは Phase 6 以降、人の承認後に適用する。

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "ix_name_cards_first_name_lower_trgm"
  ON "name_cards" USING gin (lower("first_name") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "ix_name_cards_last_name_lower_trgm"
  ON "name_cards" USING gin (lower("last_name") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "ix_name_cards_first_name_kana_lower_trgm"
  ON "name_cards" USING gin (lower("first_name_kana") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "ix_name_cards_last_name_kana_lower_trgm"
  ON "name_cards" USING gin (lower("last_name_kana") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "ix_name_cards_notes_lower_trgm"
  ON "name_cards" USING gin (lower("memo") gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX "ix_name_cards_met_notes_lower_trgm"
  ON "name_cards" USING gin (lower("met_notes") gin_trgm_ops);
