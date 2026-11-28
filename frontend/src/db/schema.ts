/**
 * 現行 PostgreSQL スキーマ（`docs/dev/db/schema.md` が正本）の Drizzle 定義。
 *
 * 方針:
 * - テーブル名・カラム名・型・NULL・既定値は本番のカタログ実測に合わせる（データ移行しない）。
 * - 追加の索引・一意制約・ON DELETE の変更はこの Phase では行わない（本番 DDL との差分を出さない）。
 * - pg_bigm 拡張と GIN 索引は `drizzle/0000_initial.sql` に手書きで持つ（Drizzle の宣言では表現しない）。
 *
 * このファイルは Phase 1 では未使用（Phase 2/3 でクエリ層から参照する）。
 */
import {
  type AnyPgColumn,
  boolean,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const nameCards = pgTable("name_cards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  firstNameKana: varchar("first_name_kana", { length: 100 }),
  lastNameKana: varchar("last_name_kana", { length: 100 }),
  companyName: varchar("company_name", { length: 200 }),
  department: varchar("department", { length: 200 }),
  position: varchar("position", { length: 200 }),
  metNotes: text("met_notes"),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const contactMethods = pgTable("contact_methods", {
  id: serial("id").primaryKey(),
  nameCardId: integer("name_card_id")
    .notNull()
    .references(() => nameCards.id),
  type: varchar("type", { length: 20 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  isPrimary: boolean("is_primary").notNull(),
});

export const nameCardImages = pgTable("name_card_images", {
  id: serial("id").primaryKey(),
  nameCardId: integer("name_card_id")
    .notNull()
    .references(() => nameCards.id, { onDelete: "cascade" }),
  imagePath: varchar("image_path", { length: 500 }).notNull(),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  name: varchar("name", { length: 100 }).notNull(),
});

export const relationships = pgTable("relationships", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  parentId: integer("parent_id").references(
    (): AnyPgColumn => relationships.id,
  ),
  name: varchar("name", { length: 100 }).notNull(),
});

export const nameCardTags = pgTable(
  "name_card_tags",
  {
    nameCardId: integer("name_card_id")
      .notNull()
      .references(() => nameCards.id),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id),
  },
  (table) => [primaryKey({ columns: [table.nameCardId, table.tagId] })],
);

export const nameCardRelationships = pgTable(
  "name_card_relationships",
  {
    nameCardId: integer("name_card_id")
      .notNull()
      .references(() => nameCards.id),
    relationshipId: integer("relationship_id")
      .notNull()
      .references(() => relationships.id),
  },
  (table) => [
    primaryKey({ columns: [table.nameCardId, table.relationshipId] }),
  ],
);
