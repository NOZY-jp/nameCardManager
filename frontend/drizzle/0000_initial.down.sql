-- 0000_initial のロールバック（新規環境の検証用）。
-- DROP EXTENSION は環境依存（他の DB が使っている可能性がある）ため書かない。
-- pg_bigm 拡張と、このマイグレーションで作ったオブジェクトだけを削除する。

DROP TABLE IF EXISTS "name_card_images";
--> statement-breakpoint
DROP TABLE IF EXISTS "name_card_tags";
--> statement-breakpoint
DROP TABLE IF EXISTS "name_card_relationships";
--> statement-breakpoint
DROP TABLE IF EXISTS "contact_methods";
--> statement-breakpoint
DROP TABLE IF EXISTS "tags";
--> statement-breakpoint
DROP TABLE IF EXISTS "relationships";
--> statement-breakpoint
DROP TABLE IF EXISTS "name_cards";
--> statement-breakpoint
DROP TABLE IF EXISTS "users";
