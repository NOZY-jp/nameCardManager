/**
 * postgres.js + Drizzle の遅延接続クライアント。
 *
 * - モジュール読み込み時には接続しない（`next build` 時に DB を要求しないため）。
 * - 接続 URL は `DATABASE_URL` のみ。値はコード・リポジトリに置かない。
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

type Sql = ReturnType<typeof postgres>;

let sql: Sql | null = null;
let database: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!sql) {
    sql = postgres(url, { max: 5, idle_timeout: 20 });
  }
  if (!database) {
    database = drizzle(sql, { schema });
  }
  return database;
}

/** テストやスクリプトで接続を閉じる用。 */
export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
    database = null;
  }
}
