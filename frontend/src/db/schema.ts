/**
 * 現行 PostgreSQL スキーマ（`docs/dev/db/schema.md` が正本）の Drizzle 定義。
 *
 * 方針:
 * - テーブル名・カラム名・型・NULL・既定値は本番のカタログ実測に合わせる（データ移行しない）。
 * - 制約名は本番の名前を明示する（PK `*_pkey`、FK `*_fkey`、UNIQUE `users_email_key`）。
 *   これにより `drizzle-kit generate` の差分が実 DDL とずれない。
 * - 追加の索引・一意制約・ON DELETE の変更はこの Phase では行わない（本番 DDL との差分を出さない）。
 * - pg_bigm 拡張と GIN 索引は `drizzle/0000_initial.sql` に手書きで持つ（Drizzle の宣言では表現しない）。
 *
 * このファイルは Phase 1 では未使用（Phase 2/3 でクエリ層から参照する）。
 */
import {
  type AnyPgColumn,
  boolean,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: serial("id").notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ name: "users_pkey", columns: [table.id] }),
    unique("users_email_key").on(table.email),
  ],
);

export const nameCards = pgTable(
  "name_cards",
  {
    id: serial("id").notNull(),
    userId: integer("user_id").notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    firstNameKana: varchar("first_name_kana", { length: 100 }),
    lastNameKana: varchar("last_name_kana", { length: 100 }),
    metNotes: text("met_notes"),
    memo: text("memo"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    companyName: varchar("company_name", { length: 200 }),
    department: varchar("department", { length: 200 }),
    position: varchar("position", { length: 200 }),
  },
  (table) => [
    primaryKey({ name: "name_cards_pkey", columns: [table.id] }),
    foreignKey({
      name: "name_cards_user_id_fkey",
      columns: [table.userId],
      foreignColumns: [users.id],
    }),
  ],
);

export const contactMethods = pgTable(
  "contact_methods",
  {
    id: serial("id").notNull(),
    nameCardId: integer("name_card_id").notNull(),
    type: varchar("type", { length: 20 }).notNull(),
    value: varchar("value", { length: 255 }).notNull(),
    isPrimary: boolean("is_primary").notNull(),
  },
  (table) => [
    primaryKey({ name: "contact_methods_pkey", columns: [table.id] }),
    foreignKey({
      name: "contact_methods_name_card_id_fkey",
      columns: [table.nameCardId],
      foreignColumns: [nameCards.id],
    }),
  ],
);

export const nameCardImages = pgTable(
  "name_card_images",
  {
    id: serial("id").notNull(),
    nameCardId: integer("name_card_id").notNull(),
    imagePath: varchar("image_path", { length: 500 }).notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ name: "name_card_images_pkey", columns: [table.id] }),
    foreignKey({
      name: "name_card_images_name_card_id_fkey",
      columns: [table.nameCardId],
      foreignColumns: [nameCards.id],
    }).onDelete("cascade"),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: serial("id").notNull(),
    userId: integer("user_id").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
  },
  (table) => [
    primaryKey({ name: "tags_pkey", columns: [table.id] }),
    foreignKey({
      name: "tags_user_id_fkey",
      columns: [table.userId],
      foreignColumns: [users.id],
    }),
  ],
);

export const relationships = pgTable(
  "relationships",
  {
    id: serial("id").notNull(),
    userId: integer("user_id").notNull(),
    parentId: integer("parent_id"),
    name: varchar("name", { length: 100 }).notNull(),
  },
  (table) => [
    primaryKey({ name: "relationships_pkey", columns: [table.id] }),
    foreignKey({
      name: "relationships_user_id_fkey",
      columns: [table.userId],
      foreignColumns: [users.id],
    }),
    foreignKey({
      name: "relationships_parent_id_fkey",
      columns: [table.parentId],
      foreignColumns: [table.id as AnyPgColumn],
    }),
  ],
);

export const nameCardTags = pgTable(
  "name_card_tags",
  {
    nameCardId: integer("name_card_id").notNull(),
    tagId: integer("tag_id").notNull(),
  },
  (table) => [
    primaryKey({ name: "name_card_tags_pkey", columns: [table.nameCardId, table.tagId] }),
    foreignKey({
      name: "name_card_tags_name_card_id_fkey",
      columns: [table.nameCardId],
      foreignColumns: [nameCards.id],
    }),
    foreignKey({
      name: "name_card_tags_tag_id_fkey",
      columns: [table.tagId],
      foreignColumns: [tags.id],
    }),
  ],
);

export const nameCardRelationships = pgTable(
  "name_card_relationships",
  {
    nameCardId: integer("name_card_id").notNull(),
    relationshipId: integer("relationship_id").notNull(),
  },
  (table) => [
    primaryKey({
      name: "name_card_relationships_pkey",
      columns: [table.nameCardId, table.relationshipId],
    }),
    foreignKey({
      name: "name_card_relationships_name_card_id_fkey",
      columns: [table.nameCardId],
      foreignColumns: [nameCards.id],
    }),
    foreignKey({
      name: "name_card_relationships_relationship_id_fkey",
      columns: [table.relationshipId],
      foreignColumns: [relationships.id],
    }),
  ],
);
