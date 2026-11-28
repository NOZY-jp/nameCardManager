# 開発の進め方（ブランチ・レビュー）

Next.js 単一アプリへの刷新（`docs/plans/nextjs-fullstack-rebuild.md`）を含む、このリポジトリの変更手順。

- **`main` へ直接 push しない。** `origin/main` から作業ブランチを切る（例: `feat/phase-1-schema`, `docs/8-p0-rebuild-docs`）。force push と履歴改変もしない。
- **1 Phase = 1 PR** を基本にし、PR の base は `main`。無関係な修正を混ぜず、差分をレビューできる大きさに保つ。Phase 0 のように docs とアプリコードを分ける場合は、コード差分が無いことを PR 本文に書く。
- 秘密情報（`.env`、サービスアカウント鍵、webhook secret）と実在の名刺データ（氏名・連絡先・画像）を、コミット・PR・Issue・ログへ書かない。テストはダミーのみ。

## レビューとマージ

1. PR を作る前に、CI と同じ検証をローカルで通す: `cd backend && uv run ruff check . && uv run pytest -q`、`cd frontend && pnpm lint && pnpm tsc --noEmit && pnpm vitest run`（`next build` は CI に任せてよい）。
2. GitHub Actions（backend: ruff + pytest / frontend: lint + tsc + vitest + build）が**緑**であることを必須とする。
3. レビューQA の **GO** と**人の承認**が揃ったら、PM が `main` へマージする。実装者はマージしない。
4. マージ後の `main` push で webhook CD が動き本番へ反映される。`deploy/` の設定ファイルはデプロイ時に自動同期されるが、`deploy.sh` 自身は自動更新されない（変えたときだけ `deploy/install.sh` を手で1回実行する）。

## コミット

- 変更内容が分かる Conventional Commits（`feat:`, `fix:`, `docs:`, `test:`, `chore:`）を使い、1 コミット 1 目的にする。
- テストは失敗するものを先に書き、実装後に通す。既存テストを緩めない（しきい値・期待値の引き下げは理由を PR に書く）。
