# FastAPI OpenAPI 自動ドキュメント生成 - 調査結果

## TL;DR

FastAPI は **OpenAPI (旧 Swagger) 仕様** に基づき、コードから API ドキュメントを **完全自動生成** する。
追加ライブラリは不要。`fastapi[standard]` だけで以下が即座に使える:

| エンドポイント | UI | 用途 |
|---|---|---|
| `/docs` | Swagger UI | ブラウザ上でAPIを試せるインタラクティブドキュメント |
| `/redoc` | ReDoc | 読みやすいリファレンス形式ドキュメント |
| `/openapi.json` | - | OpenAPI 3.1 スキーマ (JSON) - クライアント自動生成の元データ |

フロントエンド開発者はバックエンドの実装を知らなくても、これらのドキュメントだけを見て開発できる。

---

## 仕組み

```
Python 型ヒント + Pydantic モデル
        |
        v
  FastAPI が自動解析
        |
        v
  OpenAPI 3.1 スキーマ (JSON) を生成
        |
        +--------+--------+
        v                 v
   Swagger UI          ReDoc
   (/docs)            (/redoc)
```

### なぜこれが可能なのか

FastAPI は以下の情報をコードから **自動抽出** する:

1. **パスパラメータの型** - `item_id: int` → integer として文書化
2. **クエリパラメータ** - `skip: int = 0` → デフォルト値付きで文書化
3. **リクエストボディ** - Pydantic モデル → JSON Schema として文書化
4. **レスポンス** - `response_model` → レスポンス構造を文書化
5. **バリデーション** - `Field(gt=0, max_length=100)` → 制約を文書化
6. **docstring** - 関数の docstring → エンドポイントの説明文になる
7. **tags** - ルーターの `tags` → ドキュメント上のグループ分け

---

## 3つのドキュメント形式の違い

### 1. Swagger UI (`/docs`)

- **インタラクティブ**: ブラウザ上で実際にAPIリクエストを送信できる ("Try it out" ボタン)
- **フロントエンド開発者が最もよく使う**: パラメータを入力→実行→レスポンスを確認
- **デバッグにも使える**: curl を書かなくてよい

### 2. ReDoc (`/redoc`)

- **読みやすい**: 3カラムレイアウトで見やすい
- **検索機能**: ドキュメント全体を検索できる
- **プリント向き**: PDFにしても読みやすい
- **外部共有向き**: 非技術者に見せるのにも適している

### 3. OpenAPI JSON (`/openapi.json`)

- **機械可読**: ツールによる自動処理用
- **クライアントコード自動生成**: TypeScript の型やAPIクライアントを自動生成できる (後述)
- **CI/CD 連携**: スキーマの差分検知、破壊的変更の検出に使える

---

## フロント・バック分離開発のワークフロー

ハッカソンで経験した「フロントはドキュメントだけ見て開発」のフローは以下のように実現する:

```
Backend 開発者                          Frontend 開発者
     |                                        |
     |  1. FastAPI エンドポイント実装            |
     |  2. Pydantic モデル定義                  |
     |  3. サーバー起動                         |
     |                                        |
     |  --- /docs, /redoc が自動生成 ---        |
     |                                        |
     |                                   4. /docs を見る
     |                                   5. リクエスト/レスポンスを確認
     |                                   6. "Try it out" で動作確認
     |                                   7. フロントエンド実装
     |                                        |
```

### さらに進んだ方法: クライアントコード自動生成

`/openapi.json` から TypeScript のAPIクライアントを自動生成できるツールがある:

| ツール | 特徴 |
|---|---|
| [openapi-ts](https://openapi-ts.dev/) | TypeScript 型 + fetch クライアント生成。軽量で人気 |
| [Orval](https://orval.dev/) | axios/fetch クライアント + React Query hooks 生成 |
| [OpenAPI Generator](https://openapi-generator.tech/) | 40以上の言語に対応。Java, Go, Python 等 |
| [hey-api/openapi-ts](https://github.com/hey-api/openapi-ts) | Next.js との相性が良い。型安全なクライアント生成 |

使い方の例 (openapi-ts):
```bash
npx openapi-typescript http://localhost:8000/openapi.json -o ./src/generated/api.d.ts
```

これにより、フロントエンドは **型安全** にバックエンドAPIを呼べる。
バックエンドの変更が自動的にフロントの型エラーとして検出される。

---

## このプロジェクト (nameCardManager) での現状

- `backend/pyproject.toml` に `fastapi[standard]` が依存に含まれている → **追加インストール不要**
- `backend/app/api/v1/api.py` でルーターに `tags` が設定済み (`auth`, `images`, `search`, `namecards`)
- 各エンドポイントファイルはまだ空 → **エンドポイントを実装すれば即座にドキュメントが生成される**

---

## 参考リンク

- [FastAPI 公式: Metadata and Docs URLs](https://fastapi.tiangolo.com/tutorial/metadata/)
- [FastAPI 公式: Schema Extra Examples](https://fastapi.tiangolo.com/tutorial/schema-extra-example/)
- [FastAPI 公式: Generate Clients](https://fastapi.tiangolo.com/advanced/generate-clients/)
- [OpenAPI Specification 3.1](https://spec.openapis.org/oas/v3.1.0)
