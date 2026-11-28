import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit の設定。
 *
 * - `db:generate` は DB 接続不要（スキーマから SQL を生成する）。
 * - `db:migrate` / `db:push` は `DATABASE_URL` を必要とする（値はコミットしない）。
 * - 既存 DB を共用するため、破壊的な push は使わずマイグレーションで適用する。
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // 例: postgresql://USER:PASSWORD@HOST:5432/DBNAME （実値は env にだけ置く）
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
