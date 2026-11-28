# Drizzle スキーマと初期マイグレーション（Phase 1）

現行 PostgreSQL 16 + pg_bigm の DDL を、Next.js 側の Drizzle ORM 定義と 1 本の SQL に統合したもの。
正本は `docs/dev/db/schema.md`（本番カタログ実測）と `backend/app/models/__init__.py`。

## ファイル

| パス | 内容 |
| --- | --- |
| `frontend/src/db/schema.ts` | 8 テーブルの Drizzle 定義（本番の型・NULL・既定値を維持。Phase 1 では未使用） |
| `frontend/drizzle.config.ts` | Drizzle Kit 設定。接続 URL は `DATABASE_URL`（値は置かない） |
| `frontend/drizzle/0000_initial.sql` | 初期マイグレーション（pg_bigm 拡張・GIN 索引 6 本・制約・コメントを統合） |
| `frontend/drizzle/0000_initial.down.sql` | ロールバック（テーブル削除のみ。`DROP EXTENSION` はしない） |

## 適用とロールバック（新規環境のみ）

既存 DB を共用する前提のため、適用は `psql` で SQL を流す（`drizzle-kit migrate` は
`drizzle.__drizzle_migrations` を作るため、本番との差分を増やしたくないときに使わない）。

```bash
cd frontend
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DBNAME'   # 実値は env にだけ置く

# 適用
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0000_initial.sql

# ロールバック（このマイグレーションで作ったテーブルだけ削除）
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0000_initial.down.sql
```

`pnpm db:generate` はスキーマ変更時に SQL を生成する（DB 接続不要）。生成物に
pg_bigm の GIN 索引は含まれないため、索引を変えるときは手書きで追記する。

### 隔離環境での検証例

```bash
# pg_bigm 入りの PostgreSQL 16（テスト用の一時コンテナ。値はダミー）
docker build -t namecard-pgbigm-test docker/postgres   # 本番と同じ定義
docker run -d --name nc-p1-test -e POSTGRES_PASSWORD=dummy \
  -p 127.0.0.1:55432:5432 namecard-pgbigm-test -c shared_preload_libraries=pg_bigm

cd frontend
psql "postgresql://postgres:dummy@127.0.0.1:55432/postgres" -v ON_ERROR_STOP=1 -f drizzle/0000_initial.sql
psql "postgresql://postgres:dummy@127.0.0.1:55432/postgres" -v ON_ERROR_STOP=1 -f drizzle/0000_initial.down.sql
```

> 本番の `docker/postgres/Dockerfile` は Alpine の `clang19` / `llvm19` パッケージ名に依存しており、
> 現在の Alpine ではパッケージが見つからずビルドできない。隔離検証では `make USE_PGXS=1 with_llvm=no`
> で同じ拡張をビルドした（JIT の bitcode を作らないだけで、スキーマ検証には影響しない）。
> 本番イメージの再ビルドが必要になった場合は Dockerfile の修正が別途必要。

## 追加マイグレーション（0001 以降）

`0000_initial.sql` は本番カタログとの一致を目的とする。一方、`0001_add_lower_bigm_indexes.sql` は
検索の大小無視を GIN 索引で実現するための**関数インデックス追加**で、本番にはまだ存在しない。
追加マイグレーションは**新規環境にだけ適用**し、本番へは Phase 6 以降に人の承認を得てから
`psql -f` で適用する（本番 DB をこのリポジトリの作業から直接変更しない）。適用・ロールバックは
`pnpm db:apply` / `pnpm db:rollback`（0001 → 0000 の順）を使う。

## 現行 DDL との一致方針

- テーブル名・カラム名・型・NULL・既定値・制約名（`users_email_key`、`*_pkey`、`*_fkey`）を現行に合わせる。
- 列順は Alembic 適用後の物理順（`company_name` / `department` / `position` は後から追加されたため末尾）。
- `name_card_images.name_card_id` だけ `ON DELETE CASCADE`。他は `NO ACTION`（現行どおり）。
- `updated_at` は DB トリガーではなくアプリ更新（現行どおり。トリガーは作らない）。
- `alembic_version` は作らない（本番の履歴に触れない。新規環境だけを対象にする）。
- 外部キー索引・一意制約の追加、`ON DELETE` の見直しは **Phase 1 では行わない**（本番 DDL との差分を出さないため。Phase 3 以降で判断）。
- テーブルコメント `name_cards.met_notes = 'どこで出会ったか'` は `COMMENT ON COLUMN` で再現する。

## 未確認

- 本番 `pg_dump --schema-only` との完全一致（PM が最終確認する。制約・索引の OID 順や `pg_dump` の出力順は環境で変わるため、論理定義の一致を確認する）。
- `drizzle-kit generate` による将来の差分生成（スキーマ変更時に再確認する）。
