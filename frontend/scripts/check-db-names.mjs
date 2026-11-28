// 手書きマイグレーション SQL と Drizzle snapshot の制約名が一致するか検査する。
// 背景: snapshot の自動命名（*_unique / *_fk / *_pk）と本番の制約名（*_key / *_fkey / *_pkey）が
// ずれると、将来の drizzle-kit generate が実 DDL と噛み合わなくなる。
import { readFileSync } from "node:fs";

const sqlUrl = new URL("../drizzle/0000_initial.sql", import.meta.url);
const snapshotUrl = new URL(
  "../drizzle/meta/0000_snapshot.json",
  import.meta.url,
);

const sql = readFileSync(sqlUrl, "utf8");
const snapshot = JSON.parse(readFileSync(snapshotUrl, "utf8"));

const sqlNames = new Set(
  [...sql.matchAll(/CONSTRAINT\s+"([^"]+)"/g)].map((match) => match[1]),
);

const snapshotNames = new Set();
for (const table of Object.values(snapshot.tables ?? {})) {
  for (const bucket of [
    "foreignKeys",
    "compositePrimaryKeys",
    "uniqueConstraints",
  ]) {
    for (const item of Object.values(table[bucket] ?? {})) {
      if (item?.name) snapshotNames.add(item.name);
    }
  }
}

const missingInSql = [...snapshotNames].filter((name) => !sqlNames.has(name));
const extraInSql = [...sqlNames].filter((name) => !snapshotNames.has(name));

if (missingInSql.length || extraInSql.length) {
  console.error("constraint name mismatch between SQL and snapshot");
  if (missingInSql.length) {
    console.error(`only in snapshot: ${missingInSql.join(", ")}`);
  }
  if (extraInSql.length) {
    console.error(`only in SQL: ${extraInSql.join(", ")}`);
  }
  process.exit(1);
}

console.log(
  `OK: ${snapshotNames.size} constraint names match between 0000_initial.sql and snapshot`,
);
