-- 初期スキーマ（現行 PostgreSQL 16 + pg_bigm の DDL を 1 本に統合）
--
-- 正本: docs/dev/db/schema.md（本番カタログ実測）と backend/app/models/__init__.py。
-- 方針:
-- - テーブル名・カラム名・型・NULL・既定値・制約名は現行に合わせる（データ移行しない）。
-- - 列順は Alembic 適用後の物理順（company_name/department/position は後から追加されたため末尾）。
-- - pg_bigm の GIN 索引は現行の索引名のまま再現する（memo の索引名は旧 notes のまま）。
-- - 外部キー索引・一意制約の追加、ON DELETE の変更は Phase 1 では行わない（本番 DDL との差分を出さない）。
-- - Alembic の alembic_version テーブルは作らない（本番の履歴は触らない。新規環境のみ適用する前提）。
-- - updated_at の更新は現行どおりアプリ側で行う（DB トリガーは無い）。

CREATE EXTENSION IF NOT EXISTS pg_bigm;
--> statement-breakpoint

CREATE TABLE "users" (
	"id" serial NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_pkey" PRIMARY KEY("id"),
	CONSTRAINT "users_email_key" UNIQUE("email")
);
--> statement-breakpoint

CREATE TABLE "name_cards" (
	"id" serial NOT NULL,
	"user_id" integer NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"first_name_kana" varchar(100),
	"last_name_kana" varchar(100),
	"met_notes" text,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"company_name" varchar(200),
	"department" varchar(200),
	"position" varchar(200),
	CONSTRAINT "name_cards_pkey" PRIMARY KEY("id"),
	CONSTRAINT "name_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id")
);
--> statement-breakpoint

CREATE TABLE "relationships" (
	"id" serial NOT NULL,
	"user_id" integer NOT NULL,
	"parent_id" integer,
	"name" varchar(100) NOT NULL,
	CONSTRAINT "relationships_pkey" PRIMARY KEY("id"),
	CONSTRAINT "relationships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id"),
	CONSTRAINT "relationships_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "relationships"("id")
);
--> statement-breakpoint

CREATE TABLE "tags" (
	"id" serial NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	CONSTRAINT "tags_pkey" PRIMARY KEY("id"),
	CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id")
);
--> statement-breakpoint

CREATE TABLE "contact_methods" (
	"id" serial NOT NULL,
	"name_card_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"value" varchar(255) NOT NULL,
	"is_primary" boolean NOT NULL,
	CONSTRAINT "contact_methods_pkey" PRIMARY KEY("id"),
	CONSTRAINT "contact_methods_name_card_id_fkey" FOREIGN KEY ("name_card_id") REFERENCES "name_cards"("id")
);
--> statement-breakpoint

CREATE TABLE "name_card_relationships" (
	"name_card_id" integer NOT NULL,
	"relationship_id" integer NOT NULL,
	CONSTRAINT "name_card_relationships_pkey" PRIMARY KEY("name_card_id","relationship_id"),
	CONSTRAINT "name_card_relationships_name_card_id_fkey" FOREIGN KEY ("name_card_id") REFERENCES "name_cards"("id"),
	CONSTRAINT "name_card_relationships_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "relationships"("id")
);
--> statement-breakpoint

CREATE TABLE "name_card_tags" (
	"name_card_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "name_card_tags_pkey" PRIMARY KEY("name_card_id","tag_id"),
	CONSTRAINT "name_card_tags_name_card_id_fkey" FOREIGN KEY ("name_card_id") REFERENCES "name_cards"("id"),
	CONSTRAINT "name_card_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id")
);
--> statement-breakpoint

CREATE TABLE "name_card_images" (
	"id" serial NOT NULL,
	"name_card_id" integer NOT NULL,
	"image_path" varchar(500) NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "name_card_images_pkey" PRIMARY KEY("id"),
	CONSTRAINT "name_card_images_name_card_id_fkey" FOREIGN KEY ("name_card_id") REFERENCES "name_cards"("id") ON DELETE CASCADE
);
--> statement-breakpoint

-- 現行のカラムコメント（backend/app/models/__init__.py の comment）
COMMENT ON COLUMN "name_cards"."met_notes" IS 'どこで出会ったか';
--> statement-breakpoint

-- pg_bigm の GIN 索引（現行の索引名のまま。memo は旧 notes の索引名を維持）
CREATE INDEX "ix_name_cards_last_name_bigm" ON "name_cards" USING gin ("last_name" gin_bigm_ops);
--> statement-breakpoint
CREATE INDEX "ix_name_cards_first_name_bigm" ON "name_cards" USING gin ("first_name" gin_bigm_ops);
--> statement-breakpoint
CREATE INDEX "ix_name_cards_last_name_kana_bigm" ON "name_cards" USING gin ("last_name_kana" gin_bigm_ops);
--> statement-breakpoint
CREATE INDEX "ix_name_cards_first_name_kana_bigm" ON "name_cards" USING gin ("first_name_kana" gin_bigm_ops);
--> statement-breakpoint
CREATE INDEX "ix_name_cards_notes_bigm" ON "name_cards" USING gin ("memo" gin_bigm_ops);
--> statement-breakpoint
CREATE INDEX "ix_name_cards_met_notes_bigm" ON "name_cards" USING gin ("met_notes" gin_bigm_ops);
