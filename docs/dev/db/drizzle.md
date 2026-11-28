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

`0000_initial.sql` は本番カタログとの一致を目的とする。一方、`0001_add_lower_trgm_indexes.sql` は
検索の大小無視・部分一致を索引付きで実現するための **`pg_trgm` 有効化と関数インデックス追加**で、
本番にはまだ存在しない（本番の `pg_trgm` 1.6 は利用可能だが未インストール）。
追加マイグレーションを本番へ入れるのは Phase 6 以降、人の承認後だけとする。本番で使うのは
**`0001` 単体の適用と `0001.down` 単体の復元のみ**:

```bash
# 本番（Phase 6・承認後）: 0001 だけを適用/復元する（psql がある Linux/サーバー上で実行）
pnpm db:apply:0001      # psql -f drizzle/0001_add_lower_trgm_indexes.sql
pnpm db:rollback:0001   # psql -f drizzle/0001_add_lower_trgm_indexes.down.sql
```

> **警告: `db:apply` / `db:rollback` は新規環境専用。本番では実行禁止。**
> この2つは `0000_initial.sql` も実行し、`db:rollback` は `0000_initial.down.sql` で
> `users` / `name_cards` などのテーブルを DROP する（データ消失）。本番では絶対に使わない。
> 新規環境の初期化は `db:apply`（0000 + 0001）、破棄は `db:rollback`（0001 → 0000 の順）。

### 本番適用前の確認（Phase 6）

```sql
-- 拡張の作成権限（true なら適用可能）
SELECT has_database_privilege(current_user, current_database(), 'CREATE');
-- pg_trgm が利用可能か（version / trusted）
SELECT version, trusted FROM pg_available_extension_versions WHERE name = 'pg_trgm';
```

- 本番 `namecard_user` は `rolsuper=t`（PM 実測）のため適用可能。
- `0001.down.sql` は索引の DROP のみ。`DROP EXTENSION pg_trgm` は他用途で使われる可能性があるため書かない。
- `db:check-names` は `0000_initial.sql` と snapshot の制約名だけを検査する。0001 は制約ではなく索引の追加で、
  以後の追加マイグレーションは Drizzle の snapshot 管理外のため対象外（必要になったら索引名の検査を別途追加する）。

## 現行 DDL との一致方針

- テーブル名・カラム名・型・NULL・既定値・制約名（`users_email_key`、`*_pkey`、`*_fkey`）を現行に合わせる。
- 列順は Alembic 適用後の物理順（`company_name` / `department` / `position` は後から追加されたため末尾）。
- `name_card_images.name_card_id` だけ `ON DELETE CASCADE`。他は `NO ACTION`（現行どおり）。
- `updated_at` は DB トリガーではなくアプリ更新（現行どおり。トリガーは作らない）。
- `alembic_version` は作らない（本番の履歴に触れない。新規環境だけを対象にする）。
- `pg_trgm` の trigram 索引は 3 文字以上の検索語で効く。1〜2 文字の検索語は索引が使われず
  全走査（Seq Scan）に退化するが、結果は `LIKE` なので正しい（速度だけの差）。
- 外部キー索引・一意制約の追加、`ON DELETE` の見直しは **Phase 1 では行わない**（本番 DDL との差分を出さないため。Phase 3 以降で判断）。
- テーブルコメント `name_cards.met_notes = 'どこで出会ったか'` は `COMMENT ON COLUMN` で再現する。

## 未確認

- 本番 `pg_dump --schema-only` との完全一致（PM が最終確認する。制約・索引の OID 順や `pg_dump` の出力順は環境で変わるため、論理定義の一致を確認する）。
- `drizzle-kit generate` による将来の差分生成（スキーマ変更時に再確認する）。
