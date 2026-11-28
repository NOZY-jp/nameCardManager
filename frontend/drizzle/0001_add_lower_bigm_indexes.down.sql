-- 0001 のロールバック（追加した関数インデックスだけを削除する）。
DROP INDEX IF EXISTS "ix_name_cards_first_name_lower_bigm";
--> statement-breakpoint
DROP INDEX IF EXISTS "ix_name_cards_last_name_lower_bigm";
--> statement-breakpoint
DROP INDEX IF EXISTS "ix_name_cards_first_name_kana_lower_bigm";
--> statement-breakpoint
DROP INDEX IF EXISTS "ix_name_cards_last_name_kana_lower_bigm";
--> statement-breakpoint
DROP INDEX IF EXISTS "ix_name_cards_notes_lower_bigm";
--> statement-breakpoint
DROP INDEX IF EXISTS "ix_name_cards_met_notes_lower_bigm";
