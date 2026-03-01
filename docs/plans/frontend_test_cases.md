# Phase 1 フロントエンド テストケース一覧

> 作成日: 2026-02-28
> 対象: nameCardManager Phase 1-FE — Vitest ユニットテスト + Playwright E2E テスト
> 関連: [フロントエンド仕様](./momus.md)（分野10-16） / [バックエンドテスト](./test_cases.md) / [Phase計画](../../.sisyphus/plans/namecard_manager_phase1.md)
>
> **技術スタック**: Next.js 14（App Router + SSR） / shadcn/ui（SCSS化） / React Hook Form + Zod / axios / next-themes / Vitest + Playwright

---

## テスト構成

### Vitest（ユニット/コンポーネントテスト）

```
frontend/src/__tests__/
├── components/
│   ├── ui/              # Button, Input, Dialog, Select
│   ├── namecard/        # NameCardList, NameCardItem, NameCardForm, NameCardEditDialog
│   ├── relationship/    # RelationshipTree, RelationshipSelect
│   ├── tag/             # TagList, TagSelect
│   ├── camera/          # CameraCapture, CornerSelector
│   └── search/          # SearchBar
├── hooks/               # カスタムフック
└── lib/                 # API クライアント, Zod スキーマ
```

### Playwright（E2E テスト）

```
frontend/e2e/
├── auth.spec.ts         # ログイン、登録、ログアウト
├── namecards.spec.ts    # CRUD、一覧、詳細、モーダル編集
├── relationships.spec.ts # ツリー管理
├── tags.spec.ts         # タグ CRUD
├── search.spec.ts       # 検索機能
├── ocr.spec.ts          # カメラ、OCR フロー
└── export-import.spec.ts # JSON エクスポート/インポート
```

### 共通セットアップ

#### Vitest

| ユーティリティ | 説明 |
|---------------|------|
| `renderWithProviders` | AuthContext, ToastContext, ThemeProvider をラップした render ヘルパー |
| `mockAxios` | axios のモック（`vi.mock('axios')`） |
| `mockRouter` | Next.js router のモック（`vi.mock('next/navigation')`） |
| `sampleNamecard` | テスト用名刺データ（contact_methods, relationships, tags 付き） |
| `sampleRelationshipTree` | テスト用 3 階層ツリー（建築士会/桑名支部/青年会長） |
| `sampleTags` | テスト用タグ 3 件（取引先、友人、ゴルフ仲間） |

#### Playwright

| ユーティリティ | 説明 |
|---------------|------|
| `loginAsTestUser` | テストユーザーでログインし認証クッキー/トークンをセット |
| `seedTestData` | API 経由でテストデータ（名刺、Relationship、Tag）を作成 |
| `cleanupTestData` | テスト後にデータをクリーンアップ |

---

## Vitest: UI コンポーネント

> ファイル: `src/__tests__/components/ui/`

### Button

- **test_button_renders_with_text**: テキスト付きでレンダリングされる
  - Setup: `<Button>保存</Button>`
  - Expected: "保存" テキストが表示される

- **test_button_click_handler**: クリックイベントが発火する
  - Setup: `<Button onClick={handler}>保存</Button>`
  - Action: ボタンをクリック
  - Expected: `handler` が 1 回呼ばれる

- **test_button_disabled_state**: disabled 状態でクリックが無効
  - Setup: `<Button disabled onClick={handler}>保存</Button>`
  - Action: ボタンをクリック
  - Expected: `handler` が呼ばれない、`aria-disabled` が設定されている

- **test_button_variant_destructive**: variant="destructive" で危険色スタイル
  - Setup: `<Button variant="destructive">削除</Button>`
  - Expected: 適切な CSS クラスが適用される

- **test_button_loading_state**: loading 中はスピナー表示
  - Setup: `<Button loading>保存中</Button>`
  - Expected: スピナーが表示される、ボタンが無効化される

### Input

- **test_input_renders_with_placeholder**: プレースホルダー付きでレンダリングされる
  - Setup: `<Input placeholder="名前を入力" />`
  - Expected: プレースホルダーが表示される

- **test_input_value_change**: 値の変更が反映される
  - Setup: `<Input onChange={handler} />`
  - Action: "田中" を入力
  - Expected: `handler` が呼ばれ、value が "田中"

- **test_input_error_state**: エラー状態でエラースタイル表示
  - Setup: `<Input error="必須項目です" />`
  - Expected: エラーメッセージが表示される、エラースタイルが適用される

- **test_input_disabled_state**: disabled 状態で入力不可
  - Setup: `<Input disabled />`
  - Expected: input 要素が disabled

### Dialog

- **test_dialog_opens_on_trigger**: トリガーでダイアログが開く
  - Setup: `<Dialog><DialogTrigger>開く</DialogTrigger><DialogContent>内容</DialogContent></Dialog>`
  - Action: "開く" ボタンをクリック
  - Expected: "内容" が表示される

- **test_dialog_closes_on_escape**: Escape キーでダイアログが閉じる
  - Setup: ダイアログを開いた状態
  - Action: Escape キーを押下
  - Expected: ダイアログが非表示になる

- **test_dialog_closes_on_overlay_click**: オーバーレイクリックで閉じる
  - Setup: ダイアログを開いた状態
  - Action: オーバーレイをクリック
  - Expected: ダイアログが非表示になる

### Select

- **test_select_renders_options**: オプション一覧が表示される
  - Setup: `<Select options={[{value: "email", label: "メール"}, {value: "tel", label: "電話"}]} />`
  - Action: セレクトを開く
  - Expected: "メール", "電話" が表示される

- **test_select_value_change**: 選択変更が反映される
  - Setup: `<Select options={options} onChange={handler} />`
  - Action: "メール" を選択
  - Expected: `handler` が `"email"` で呼ばれる

- **test_select_placeholder**: プレースホルダー表示
  - Setup: `<Select placeholder="選択してください" />`
  - Expected: "選択してください" が表示される

---

## Vitest: NameCard コンポーネント

> ファイル: `src/__tests__/components/namecard/`

### NameCardList

- **test_namecard_list_renders_items**: 名刺一覧が正しくレンダリングされる
  - Setup: `<NameCardList items={[card1, card2, card3]} />`
  - Expected: 3 件の名刺アイテムが表示される

- **test_namecard_list_empty_state**: 名刺 0 件で空メッセージ表示
  - Setup: `<NameCardList items={[]} />`
  - Expected: "名刺がありません" 等の空メッセージが表示される

- **test_namecard_list_pagination**: ページネーションコンポーネントが表示される
  - Setup: `<NameCardList items={items} total={50} page={1} perPage={20} />`
  - Expected: ページネーション UI が表示される、total_pages=3

- **test_namecard_list_page_change**: ページ変更が呼ばれる
  - Setup: `<NameCardList ... onPageChange={handler} />`
  - Action: ページ 2 をクリック
  - Expected: `handler` が `2` で呼ばれる

- **test_namecard_list_loading_state**: ローディング中はスケルトン表示
  - Setup: `<NameCardList loading={true} />`
  - Expected: スケルトンローダーが表示される

### NameCardItem

- **test_namecard_item_renders_name**: 氏名が表示される
  - Setup: `<NameCardItem card={{first_name: "太郎", last_name: "田中", ...}} />`
  - Expected: "田中 太郎" が表示される

- **test_namecard_item_renders_relationships**: Relationship の full_path が表示される
  - Setup: card に `relationships: [{full_path: "建築士会/桑名支部/青年会長"}]`
  - Expected: "建築士会/桑名支部/青年会長" が表示される

- **test_namecard_item_renders_tags**: タグが表示される
  - Setup: card に `tags: [{name: "取引先"}, {name: "友人"}]`
  - Expected: "取引先", "友人" のバッジが表示される

- **test_namecard_item_renders_thumbnail**: サムネイルが表示される
  - Setup: card に `image_path: "/images/1.webp"`
  - Expected: サムネイル画像が表示される

- **test_namecard_item_no_thumbnail**: 画像なしでデフォルトアイコン表示
  - Setup: card に `image_path: null`
  - Expected: デフォルトのプレースホルダーアイコンが表示される

- **test_namecard_item_click_navigates**: クリックで詳細ページへ遷移
  - Setup: `<NameCardItem card={{id: 1, ...}} />`
  - Action: カードをクリック
  - Expected: `/namecards/1` へのナビゲーションが呼ばれる

### NameCardForm

- **test_namecard_form_renders_required_fields**: 必須フィールドが表示される
  - Setup: `<NameCardForm />`
  - Expected: 姓（last_name）、名（first_name）の入力欄が表示される

- **test_namecard_form_renders_optional_fields**: 任意フィールドが表示される
  - Setup: `<NameCardForm />`
  - Expected: カナ、メモ、出会いメモ等の入力欄が表示される

- **test_namecard_form_submit_success**: フォーム送信が成功する
  - Setup: `<NameCardForm onSubmit={handler} />`
  - Action: 必須フィールドを入力し送信
  - Expected: `handler` がフォームデータで呼ばれる

- **test_namecard_form_validation_required_first_name**: first_name 未入力でエラー
  - Setup: `<NameCardForm />`
  - Action: first_name を空のまま送信
  - Expected: "名は必須です" 等のエラーメッセージ表示

- **test_namecard_form_validation_required_last_name**: last_name 未入力でエラー
  - Setup: `<NameCardForm />`
  - Action: last_name を空のまま送信
  - Expected: "姓は必須です" 等のエラーメッセージ表示

- **test_namecard_form_add_contact_method**: ContactMethod を動的に追加できる
  - Setup: `<NameCardForm />`
  - Action: "連絡先を追加" ボタンをクリック
  - Expected: 新しい ContactMethod 入力行が追加される

- **test_namecard_form_remove_contact_method**: ContactMethod を削除できる
  - Setup: ContactMethod が 2 件ある状態
  - Action: 1 件目の "削除" ボタンをクリック
  - Expected: 1 件のみ残る

- **test_namecard_form_contact_method_type_select**: ContactMethod の type を選択できる
  - Setup: ContactMethod 入力行が表示されている状態
  - Action: type セレクトで "email" を選択
  - Expected: type が "email" に設定される

- **test_namecard_form_contact_method_type_enum**: type に 17 種類の選択肢がある
  - Setup: ContactMethod の type セレクトを開く
  - Expected: email, tel, mobile, fax, website, x, instagram, youtube, discord, booth, github, linkedin, facebook, line, tiktok, address, other の 17 種類

- **test_namecard_form_prefill_data**: 初期値がフォームにプリフィルされる
  - Setup: `<NameCardForm defaultValues={existingCard} />`
  - Expected: 全フィールドに既存データが表示される

- **test_namecard_form_prefill_contact_methods**: 初期値の contact_methods がプリフィルされる
  - Setup: defaultValues に contact_methods 2 件
  - Expected: 2 件の ContactMethod 入力行が表示される

- **test_namecard_form_relationship_select**: Relationship を選択できる
  - Setup: `<NameCardForm relationships={tree} />`
  - Action: RelationshipSelect で "建築士会/桑名支部" を選択
  - Expected: 選択された Relationship が表示される

- **test_namecard_form_multiple_relationships**: 複数の Relationship を選択できる（兼務）
  - Setup: 複数の Relationship ツリー
  - Action: 2 つの Relationship を選択
  - Expected: 2 件の Relationship が表示される

- **test_namecard_form_tag_select**: Tag を選択できる
  - Setup: `<NameCardForm tags={tags} />`
  - Action: TagSelect で "取引先" を選択
  - Expected: 選択された Tag が表示される

- **test_namecard_form_multiple_tags**: 複数の Tag を選択できる
  - Setup: 3 つのタグが利用可能
  - Action: 3 つのタグを全て選択
  - Expected: 3 件のタグが表示される

### NameCardEditDialog

- **test_edit_dialog_opens_with_data**: 名刺データ付きでダイアログが開く
  - Setup: `<NameCardEditDialog card={existingCard} open={true} />`
  - Expected: ダイアログ内に NameCardForm が表示され、既存データがプリフィルされる

- **test_edit_dialog_submit_calls_update**: 送信で更新 API が呼ばれる
  - Setup: ダイアログ内のフォームに変更を加える
  - Action: "保存" ボタンをクリック
  - Expected: `onSave` ハンドラが更新データで呼ばれる

- **test_edit_dialog_cancel_closes**: キャンセルでダイアログが閉じる
  - Setup: ダイアログが開いた状態
  - Action: "キャンセル" ボタンをクリック
  - Expected: `onClose` ハンドラが呼ばれる

- **test_edit_dialog_validation_error**: バリデーションエラー時はダイアログが閉じない
  - Setup: ダイアログ内で必須フィールドを空にする
  - Action: "保存" ボタンをクリック
  - Expected: エラーメッセージが表示され、ダイアログは開いたまま

---

## Vitest: Relationship コンポーネント

> ファイル: `src/__tests__/components/relationship/`

### RelationshipTree

- **test_relationship_tree_renders_root_nodes**: ルートノードが表示される
  - Setup: `<RelationshipTree tree={[{name: "建築士会", children: [...]}, {name: "Jasca", children: [...]}]} />`
  - Expected: "建築士会", "Jasca" が表示される

- **test_relationship_tree_renders_nested**: ネストされた子ノードが表示される
  - Setup: 3 階層ツリー（建築士会/桑名支部/青年会長）
  - Expected: 展開時に全階層が表示される

- **test_relationship_tree_expand_collapse**: ノードの展開/折りたたみ
  - Setup: 子を持つノード
  - Action: ノードのトグルをクリック
  - Expected: 子ノードの表示/非表示が切り替わる

- **test_relationship_tree_empty_state**: ツリーが空のとき空メッセージ
  - Setup: `<RelationshipTree tree={[]} />`
  - Expected: "所属・関係性がありません" 等の空メッセージ表示

- **test_relationship_tree_add_node**: ノード追加ボタンが動作する
  - Setup: `<RelationshipTree ... onAdd={handler} />`
  - Action: "追加" ボタンをクリックし、名前を入力
  - Expected: `handler` が `{name: "新ノード", parent_id: ...}` で呼ばれる

- **test_relationship_tree_delete_leaf_node**: リーフノードの削除ボタンが表示される
  - Setup: 子を持たないノード
  - Expected: 削除ボタンが表示される

- **test_relationship_tree_no_delete_for_parent**: 子を持つノードは削除不可
  - Setup: 子ノードを持つ親ノード
  - Expected: 削除ボタンが表示されない、または無効化されている

- **test_relationship_tree_edit_name**: ノード名を編集できる
  - Setup: `<RelationshipTree ... onUpdate={handler} />`
  - Action: ノード名をダブルクリックまたは編集ボタン → 名前を変更
  - Expected: `handler` が `{id: ..., name: "新名称"}` で呼ばれる

### RelationshipSelect

- **test_relationship_select_renders_tree**: ツリー構造が選択可能に表示される
  - Setup: `<RelationshipSelect tree={relationshipTree} onChange={handler} />`
  - Expected: ツリー構造のドロップダウンが表示される

- **test_relationship_select_selects_node**: ノードを選択できる
  - Setup: ツリーを開いた状態
  - Action: "桑名支部" をクリック
  - Expected: `handler` が `桑名支部_id` で呼ばれる

- **test_relationship_select_shows_full_path**: 選択したノードの full_path が表示される
  - Setup: "建築士会/桑名支部/青年会長" を選択した状態
  - Expected: "建築士会/桑名支部/青年会長" が表示される

- **test_relationship_select_multiple**: 複数ノードを選択できる（兼務対応）
  - Setup: `<RelationshipSelect multiple ... />`
  - Action: 2 つのノードを選択
  - Expected: 2 件の選択が反映される

---

## Vitest: Tag コンポーネント

> ファイル: `src/__tests__/components/tag/`

### TagList

- **test_tag_list_renders_tags**: タグ一覧が表示される
  - Setup: `<TagList tags={[{name: "取引先"}, {name: "友人"}, {name: "ゴルフ仲間"}]} />`
  - Expected: 3 件のタグが表示される

- **test_tag_list_empty_state**: タグ 0 件で空メッセージ
  - Setup: `<TagList tags={[]} />`
  - Expected: "タグがありません" 等の空メッセージ表示

- **test_tag_list_add_tag**: タグ追加フォームが動作する
  - Setup: `<TagList ... onAdd={handler} />`
  - Action: タグ名を入力して追加ボタンをクリック
  - Expected: `handler` が `{name: "新タグ"}` で呼ばれる

- **test_tag_list_delete_tag**: タグ削除が動作する
  - Setup: `<TagList ... onDelete={handler} />`
  - Action: "取引先" の削除ボタンをクリック
  - Expected: `handler` が `取引先_id` で呼ばれる

- **test_tag_list_edit_tag**: タグ名の編集が動作する
  - Setup: `<TagList ... onUpdate={handler} />`
  - Action: タグ名を編集
  - Expected: `handler` が `{id: ..., name: "重要取引先"}` で呼ばれる

- **test_tag_list_add_empty_name_validation**: 空名のタグ追加でエラー
  - Setup: タグ追加フォーム
  - Action: 空文字で追加を試行
  - Expected: バリデーションエラーが表示される

### TagSelect

- **test_tag_select_renders_options**: タグ一覧が選択可能に表示される
  - Setup: `<TagSelect tags={tags} onChange={handler} />`
  - Expected: タグの選択肢が表示される

- **test_tag_select_selects_tag**: タグを選択できる
  - Setup: タグ選択を開いた状態
  - Action: "取引先" を選択
  - Expected: `handler` が呼ばれる

- **test_tag_select_multiple**: 複数タグを選択できる
  - Setup: `<TagSelect multiple ... />`
  - Action: 3 つのタグを選択
  - Expected: 3 件の選択が反映される

- **test_tag_select_deselect**: タグの選択を解除できる
  - Setup: "取引先" が選択された状態
  - Action: "取引先" を再度クリック
  - Expected: 選択が解除される

---

## Vitest: Camera コンポーネント

> ファイル: `src/__tests__/components/camera/`

### CameraCapture

- **test_camera_capture_renders_guide**: カメラガイド枠が表示される
  - Setup: `<CameraCapture onCapture={handler} />`（カメラ API モック）
  - Expected: 名刺サイズのガイド枠が表示される

- **test_camera_capture_button**: 撮影ボタンが表示される
  - Setup: `<CameraCapture onCapture={handler} />`
  - Expected: 撮影ボタンが表示される

- **test_camera_capture_calls_handler**: 撮影でハンドラが呼ばれる
  - Setup: カメラ API モック、`<CameraCapture onCapture={handler} />`
  - Action: 撮影ボタンをクリック
  - Expected: `handler` が画像データで呼ばれる

- **test_camera_capture_permission_denied**: カメラ権限拒否でエラー表示
  - Setup: カメラ API を権限拒否でモック
  - Expected: "カメラへのアクセスが許可されていません" 等のエラーメッセージ

### CornerSelector

- **test_corner_selector_renders_four_corners**: 4 つのコーナーポイントが表示される
  - Setup: `<CornerSelector image={imageData} onConfirm={handler} />`
  - Expected: 4 つのドラッグ可能なポイントが表示される

- **test_corner_selector_default_positions**: デフォルト位置が画像の四隅
  - Setup: `<CornerSelector image={imageData} />`
  - Expected: 初期位置が画像の頂点付近

- **test_corner_selector_confirm**: 確定ボタンで座標が返る
  - Setup: `<CornerSelector ... onConfirm={handler} />`
  - Action: "確定" ボタンをクリック
  - Expected: `handler` が `[{x, y}, {x, y}, {x, y}, {x, y}]` で呼ばれる

- **test_corner_selector_svg_overlay**: SVG オーバーレイが画像上に表示される
  - Setup: `<CornerSelector image={imageData} />`
  - Expected: SVG 要素が画像上にオーバーレイとして表示される

---

## Vitest: Search コンポーネント

> ファイル: `src/__tests__/components/search/`

### SearchBar

- **test_search_bar_renders_input**: 検索入力欄が表示される
  - Setup: `<SearchBar onSearch={handler} />`
  - Expected: 検索アイコンと入力欄が表示される

- **test_search_bar_input_change**: テキスト入力が反映される
  - Setup: `<SearchBar onSearch={handler} />`
  - Action: "田中" を入力
  - Expected: 入力欄に "田中" が表示される

- **test_search_bar_debounce**: debounce 後に検索が実行される
  - Setup: `<SearchBar onSearch={handler} debounce={300} />`
  - Action: "田中" を入力
  - Expected: 300ms 後に `handler` が "田中" で呼ばれる（即座には呼ばれない）

- **test_search_bar_clear**: クリアボタンで検索をリセット
  - Setup: "田中" を入力した状態
  - Action: クリアボタンをクリック
  - Expected: 入力欄が空になり、`handler` が "" で呼ばれる

---

## Vitest: カスタムフック

> ファイル: `src/__tests__/hooks/`

### useAuth

- **test_use_auth_returns_user**: ログイン済みユーザー情報を返す
  - Setup: AuthContext にユーザー情報をセット
  - Expected: `user` が `{id, email}` を返す

- **test_use_auth_returns_null_when_unauthenticated**: 未ログイン時は null
  - Setup: AuthContext が空
  - Expected: `user` が `null`

- **test_use_auth_login**: login 関数でトークンが保存される
  - Setup: API モック（200 + token）
  - Action: `login("test@example.com", "pass")`
  - Expected: トークンが保存される、`user` が更新される

- **test_use_auth_logout**: logout 関数でトークンが削除される
  - Setup: ログイン済み状態
  - Action: `logout()`
  - Expected: トークンが削除される、`user` が `null`

- **test_use_auth_login_error**: ログイン失敗でエラーが返る
  - Setup: API モック（401）
  - Action: `login("test@example.com", "wrong")`
  - Expected: エラーが throw される

### useToast

- **test_use_toast_show**: トーストを表示できる
  - Setup: ToastContext 内で使用
  - Action: `toast({message: "保存しました", type: "success"})`
  - Expected: トースト通知が表示される

- **test_use_toast_auto_dismiss**: トーストが自動的に消える
  - Setup: トーストを表示
  - Action: 一定時間経過
  - Expected: トーストが非表示になる

---

## Vitest: API クライアント

> ファイル: `src/__tests__/lib/api/`

### client（axios インスタンス）

- **test_api_client_adds_auth_header**: リクエストに Authorization ヘッダーが付与される
  - Setup: トークンを保存した状態
  - Action: API リクエストを送信
  - Expected: `Authorization: Bearer <token>` ヘッダーが含まれる

- **test_api_client_handles_401**: 401 レスポンスでログアウト処理
  - Setup: API モック（401）
  - Action: API リクエストを送信
  - Expected: トークンが削除される、ログインページへリダイレクト

- **test_api_client_base_url**: ベース URL が正しく設定される
  - Setup: 環境変数で API URL を設定
  - Expected: `baseURL` が `/api/v1` を含む

### namecards API

- **test_api_namecards_list**: 名刺一覧取得が正しいエンドポイントを呼ぶ
  - Setup: axios モック
  - Action: `namecardApi.list({page: 1, perPage: 20})`
  - Expected: `GET /api/v1/namecards?page=1&per_page=20` が呼ばれる

- **test_api_namecards_create**: 名刺作成が正しいボディを送信する
  - Setup: axios モック
  - Action: `namecardApi.create({first_name: "太郎", last_name: "田中"})`
  - Expected: `POST /api/v1/namecards` が正しいボディで呼ばれる

- **test_api_namecards_update**: 名刺更新が PATCH を送信する
  - Setup: axios モック
  - Action: `namecardApi.update(1, {first_name: "次郎"})`
  - Expected: `PATCH /api/v1/namecards/1` が呼ばれる

- **test_api_namecards_delete**: 名刺削除が DELETE を送信する
  - Setup: axios モック
  - Action: `namecardApi.delete(1)`
  - Expected: `DELETE /api/v1/namecards/1` が呼ばれる

### search API

- **test_api_search_with_query**: キーワード検索が正しいパラメータを送信する
  - Setup: axios モック
  - Action: `searchApi.search({q: "田中", page: 1})`
  - Expected: `GET /api/v1/search?q=田中&page=1` が呼ばれる

- **test_api_search_with_filters**: フィルタ付き検索が正しいパラメータを送信する
  - Setup: axios モック
  - Action: `searchApi.search({q: "田中", tag_ids: "1,2", relationship_ids: "3"})`
  - Expected: クエリパラメータに `tag_ids=1,2&relationship_ids=3` が含まれる

### images API

- **test_api_images_upload**: 画像アップロードが multipart で送信される
  - Setup: axios モック
  - Action: `imageApi.upload(file)`
  - Expected: `POST /api/v1/images/upload` が `multipart/form-data` で呼ばれる

- **test_api_images_process**: 画像処理が corners を送信する
  - Setup: axios モック
  - Action: `imageApi.process({upload_id: "uuid", corners: [{x:10,y:20}, ...]})`
  - Expected: `POST /api/v1/images/process` が正しいボディで呼ばれる

---

## Vitest: Zod スキーマ

> ファイル: `src/__tests__/lib/schemas/`

### auth スキーマ

- **test_login_schema_valid**: 有効なログインデータ
  - Input: `{email: "test@example.com", password: "securepass123"}`
  - Expected: パースが成功する

- **test_login_schema_invalid_email**: 不正なメールアドレスでエラー
  - Input: `{email: "not-an-email", password: "pass"}`
  - Expected: パースが失敗する（email フィールドエラー）

- **test_login_schema_missing_password**: パスワード未指定でエラー
  - Input: `{email: "test@example.com"}`
  - Expected: パースが失敗する

- **test_register_schema_valid**: 有効な登録データ
  - Input: `{email: "test@example.com", password: "securepass123"}`
  - Expected: パースが成功する

### namecard スキーマ

- **test_namecard_create_schema_minimal**: 最小フィールドで有効
  - Input: `{first_name: "太郎", last_name: "田中"}`
  - Expected: パースが成功する

- **test_namecard_create_schema_full**: 全フィールドで有効
  - Input: 全フィールド指定（contact_methods, relationship_ids, tag_ids 含む）
  - Expected: パースが成功する

- **test_namecard_create_schema_missing_first_name**: first_name 未指定でエラー
  - Input: `{last_name: "田中"}`
  - Expected: パースが失敗する

- **test_namecard_create_schema_missing_last_name**: last_name 未指定でエラー
  - Input: `{first_name: "太郎"}`
  - Expected: パースが失敗する

- **test_namecard_update_schema_partial**: 部分更新が有効
  - Input: `{first_name: "次郎"}`
  - Expected: パースが成功する（全フィールド Optional）

### contact-method スキーマ

- **test_contact_method_schema_valid**: 有効な ContactMethod
  - Input: `{type: "email", value: "a@b.com", is_primary: true}`
  - Expected: パースが成功する

- **test_contact_method_schema_invalid_type**: 不正な type でエラー
  - Input: `{type: "invalid", value: "foo"}`
  - Expected: パースが失敗する

- **test_contact_method_schema_all_types**: 17 種類の type が全て有効
  - Input: 各 type（email, tel, mobile, fax, website, x, instagram, youtube, discord, booth, github, linkedin, facebook, line, tiktok, address, other）
  - Expected: 全てパースが成功する

- **test_contact_method_schema_missing_value**: value 未指定でエラー
  - Input: `{type: "email"}`
  - Expected: パースが失敗する

### relationship スキーマ

- **test_relationship_create_schema_root**: ルートノード作成が有効
  - Input: `{name: "建築士会"}`
  - Expected: パースが成功する（parent_id は Optional）

- **test_relationship_create_schema_child**: 子ノード作成が有効
  - Input: `{name: "桑名支部", parent_id: 1}`
  - Expected: パースが成功する

- **test_relationship_create_schema_empty_name**: 空名でエラー
  - Input: `{name: ""}`
  - Expected: パースが失敗する

### tag スキーマ

- **test_tag_create_schema_valid**: 有効なタグ作成
  - Input: `{name: "取引先"}`
  - Expected: パースが成功する

- **test_tag_create_schema_empty_name**: 空名でエラー
  - Input: `{name: ""}`
  - Expected: パースが失敗する

### search スキーマ

- **test_search_query_schema_valid**: 有効な検索クエリ
  - Input: `{q: "田中", page: 1, per_page: 20}`
  - Expected: パースが成功する

- **test_search_query_schema_empty_query**: 空クエリが有効（全件返却）
  - Input: `{q: ""}`
  - Expected: パースが成功する

- **test_search_query_schema_with_filters**: フィルタ付きクエリが有効
  - Input: `{q: "田中", tag_ids: "1,2", relationship_ids: "3"}`
  - Expected: パースが成功する

### import スキーマ

- **test_import_schema_valid**: 有効なインポートデータ
  - Input: `{version: "1.0", relationships: [...], tags: [...], namecards: [...]}`
  - Expected: パースが成功する

- **test_import_schema_missing_version**: version 未指定でエラー
  - Input: `{relationships: [], tags: [], namecards: []}`
  - Expected: パースが失敗する

- **test_import_schema_empty_arrays**: 空配列で有効
  - Input: `{version: "1.0", relationships: [], tags: [], namecards: []}`
  - Expected: パースが成功する

---

## Playwright: 認証フロー

> ファイル: `e2e/auth.spec.ts`

### 正常系

- **test_register_and_login_flow**: 新規登録 → ログイン → 名刺一覧表示
  - Steps:
    1. `/register` に遷移
    2. メールアドレスとパスワードを入力して登録
    3. 登録成功メッセージが表示される
    4. `/login` に遷移
    5. 同じ認証情報でログイン
    6. 名刺一覧ページ（`/`）にリダイレクトされる
  - Expected: URL が `/` になり、名刺一覧が表示される

- **test_login_success**: 登録済みユーザーでログインできる
  - Setup: テストユーザーが登録済み
  - Steps:
    1. `/login` に遷移
    2. メールアドレスとパスワードを入力
    3. "ログイン" ボタンをクリック
  - Expected: 名刺一覧ページにリダイレクトされる

- **test_logout_flow**: ログアウトすると認証が無効になる
  - Setup: ログイン済み
  - Steps:
    1. ログアウトボタンをクリック
    2. `/login` にリダイレクトされる
    3. `/` に直接アクセスを試みる
  - Expected: `/login` にリダイレクトされる（保護されたページにアクセスできない）

### 異常系

- **test_login_wrong_password**: パスワード不一致でエラー表示
  - Steps:
    1. `/login` に遷移
    2. 間違ったパスワードでログイン
  - Expected: エラーメッセージが表示される、ログインページに留まる

- **test_login_nonexistent_user**: 存在しないユーザーでエラー表示
  - Steps:
    1. `/login` に遷移
    2. 存在しないメールアドレスでログイン
  - Expected: エラーメッセージが表示される

- **test_register_duplicate_email**: 既存メールで登録するとエラー
  - Setup: テストユーザーが登録済み
  - Steps:
    1. `/register` に遷移
    2. 同じメールアドレスで登録
  - Expected: エラーメッセージが表示される

- **test_register_invalid_email**: 不正なメールアドレスでバリデーションエラー
  - Steps:
    1. `/register` に遷移
    2. "not-an-email" を入力
    3. 送信
  - Expected: バリデーションエラーが表示される

- **test_protected_page_redirect**: 未認証で保護されたページにアクセスするとリダイレクト
  - Steps:
    1. ログアウト状態で `/` に直接アクセス
  - Expected: `/login` にリダイレクトされる

---

## Playwright: 名刺 CRUD

> ファイル: `e2e/namecards.spec.ts`

### 正常系

- **test_create_namecard_minimal**: 必須フィールドのみで名刺を作成できる
  - Setup: ログイン済み
  - Steps:
    1. `/namecards/new` に遷移
    2. 姓 "田中"、名 "太郎" を入力
    3. "保存" ボタンをクリック
    4. 名刺詳細ページに遷移する
  - Expected: 詳細ページに "田中 太郎" が表示される

- **test_create_namecard_full**: 全フィールド入力で名刺を作成できる
  - Setup: ログイン済み、Relationship/Tag 作成済み
  - Steps:
    1. `/namecards/new` に遷移
    2. 全フィールド（氏名、カナ、連絡先、Relationship、Tag、メモ）を入力
    3. "保存" ボタンをクリック
  - Expected: 詳細ページに全情報が表示される

- **test_create_namecard_with_contact_methods**: 複数の連絡先付きで名刺を作成できる
  - Setup: ログイン済み
  - Steps:
    1. `/namecards/new` に遷移
    2. 氏名を入力
    3. "連絡先を追加" をクリック → type "email"、value を入力
    4. "連絡先を追加" をクリック → type "mobile"、value を入力
    5. "保存" ボタンをクリック
  - Expected: 詳細ページに 2 件の連絡先が表示される

- **test_view_namecard_detail**: 名刺詳細ページで全情報が表示される
  - Setup: 名刺 1 件（contact_methods, relationships, tags 付き）
  - Steps:
    1. `/namecards/{id}` に遷移
  - Expected: 氏名、カナ、連絡先、Relationship（full_path）、Tag、メモが表示される

- **test_edit_namecard_modal**: モーダルで名刺を編集できる
  - Setup: 名刺 1 件作成済み
  - Steps:
    1. `/namecards/{id}` に遷移
    2. "編集" ボタンをクリック
    3. NameCardEditDialog が表示される
    4. 名を "次郎" に変更
    5. "保存" ボタンをクリック
    6. ダイアログが閉じる
  - Expected: 詳細ページに "田中 次郎" が表示される

- **test_delete_namecard**: 名刺を削除できる
  - Setup: 名刺 1 件作成済み
  - Steps:
    1. `/namecards/{id}` に遷移
    2. "削除" ボタンをクリック
    3. 確認ダイアログで "削除する" をクリック
  - Expected: 名刺一覧ページにリダイレクトされ、削除した名刺が表示されない

- **test_namecard_list_pagination**: 名刺一覧のページネーションが動作する
  - Setup: 名刺 25 件作成済み
  - Steps:
    1. `/` に遷移
    2. 名刺一覧が 20 件表示される
    3. ページ 2 のボタンをクリック
  - Expected: 残り 5 件が表示される

- **test_namecard_list_shows_thumbnail**: 一覧にサムネイルが表示される
  - Setup: 画像付き名刺
  - Steps:
    1. `/` に遷移
  - Expected: 名刺カードにサムネイル画像が表示される

### 異常系

- **test_create_namecard_validation_error**: 必須フィールド未入力でエラー表示
  - Steps:
    1. `/namecards/new` に遷移
    2. 何も入力せず "保存" ボタンをクリック
  - Expected: 姓と名の必須エラーメッセージが表示される

- **test_edit_namecard_cancel**: モーダル編集のキャンセルで変更が保存されない
  - Setup: 名刺 1 件
  - Steps:
    1. `/namecards/{id}` に遷移
    2. "編集" ボタンをクリック
    3. 名前を変更
    4. "キャンセル" ボタンをクリック
  - Expected: 名前が元のまま表示される

---

## Playwright: Relationship 管理

> ファイル: `e2e/relationships.spec.ts`

### 正常系

- **test_relationship_tree_display**: ツリー構造が表示される
  - Setup: ログイン済み、3 階層ツリー作成済み（建築士会/桑名支部/青年会長）
  - Steps:
    1. `/relationships` に遷移
  - Expected: ツリー構造で "建築士会", "桑名支部", "青年会長" が表示される

- **test_add_root_relationship**: ルートノードを追加できる
  - Setup: ログイン済み
  - Steps:
    1. `/relationships` に遷移
    2. "追加" ボタンをクリック
    3. 名前 "Jasca" を入力
    4. 保存
  - Expected: ツリーに "Jasca" が追加される

- **test_add_child_relationship**: 子ノードを追加できる
  - Setup: ルートノード "建築士会" が存在
  - Steps:
    1. `/relationships` に遷移
    2. "建築士会" ノードの "子を追加" をクリック
    3. 名前 "桑名支部" を入力
    4. 保存
  - Expected: "建築士会" の下に "桑名支部" が表示される

- **test_rename_relationship**: ノード名を変更できる
  - Setup: "桑名支部" ノードが存在
  - Steps:
    1. `/relationships` に遷移
    2. "桑名支部" の編集ボタンをクリック
    3. "四日市支部" に変更
    4. 保存
  - Expected: ノード名が "四日市支部" に変更される

- **test_delete_leaf_relationship**: リーフノードを削除できる
  - Setup: "建築士会/桑名支部/青年会長" が存在
  - Steps:
    1. `/relationships` に遷移
    2. "青年会長" の削除ボタンをクリック
    3. 確認ダイアログで "削除する" をクリック
  - Expected: "青年会長" がツリーから消える、"桑名支部" は残る

### 異常系

- **test_delete_parent_relationship_error**: 子を持つノードの削除でエラー
  - Setup: "建築士会/桑名支部" が存在（桑名支部は子）
  - Steps:
    1. `/relationships` に遷移
    2. "建築士会" の削除を試みる
  - Expected: 削除ボタンが無効、またはエラーメッセージ "子ノードがあるため削除できません"

- **test_add_relationship_empty_name**: 空名でのノード追加でエラー
  - Steps:
    1. "追加" をクリック
    2. 名前を空のまま保存
  - Expected: バリデーションエラーが表示される

---

## Playwright: タグ管理

> ファイル: `e2e/tags.spec.ts`

### 正常系

- **test_tag_list_display**: タグ一覧が表示される
  - Setup: ログイン済み、タグ 3 件作成済み
  - Steps:
    1. `/tags` に遷移
  - Expected: "取引先", "友人", "ゴルフ仲間" が表示される

- **test_create_tag**: 新しいタグを作成できる
  - Setup: ログイン済み
  - Steps:
    1. `/tags` に遷移
    2. タグ名 "重要" を入力
    3. "追加" ボタンをクリック
  - Expected: タグ一覧に "重要" が追加される

- **test_rename_tag**: タグ名を変更できる
  - Setup: タグ "取引先" が存在
  - Steps:
    1. `/tags` に遷移
    2. "取引先" の編集ボタンをクリック
    3. "重要取引先" に変更
    4. 保存
  - Expected: タグ名が "重要取引先" に変更される

- **test_delete_tag**: タグを削除できる
  - Setup: タグ "友人" が存在
  - Steps:
    1. `/tags` に遷移
    2. "友人" の削除ボタンをクリック
    3. 確認ダイアログで "削除する" をクリック
  - Expected: "友人" がタグ一覧から消える

### 異常系

- **test_create_tag_duplicate_error**: 重複タグ名でエラー
  - Setup: タグ "取引先" が既に存在
  - Steps:
    1. `/tags` に遷移
    2. タグ名 "取引先" を入力
    3. "追加" ボタンをクリック
  - Expected: "既に存在するタグです" 等のエラーメッセージが表示される

- **test_create_tag_empty_name**: 空名でエラー
  - Steps:
    1. `/tags` に遷移
    2. タグ名を空のまま "追加" をクリック
  - Expected: バリデーションエラーが表示される

---

## Playwright: 検索機能

> ファイル: `e2e/search.spec.ts`

### 正常系

- **test_search_by_name**: 氏名でキーワード検索できる
  - Setup: ログイン済み、名刺 "田中太郎", "佐藤花子" 作成済み
  - Steps:
    1. `/` に遷移
    2. 検索バーに "田中" を入力
    3. 検索結果を待つ
  - Expected: "田中太郎" のみ表示される

- **test_search_partial_match**: 部分一致で検索できる
  - Setup: 名刺 "田中太郎" 作成済み
  - Steps:
    1. 検索バーに "田" を入力
  - Expected: "田中太郎" が表示される

- **test_search_by_kana**: カナで検索できる
  - Setup: 名刺（last_name_kana="たなか"）作成済み
  - Steps:
    1. 検索バーに "たなか" を入力
  - Expected: 該当名刺が表示される

- **test_search_filter_by_tag**: タグでフィルタリングできる
  - Setup: タグ "取引先" 付き名刺 2 件、タグ "友人" 付き名刺 1 件
  - Steps:
    1. タグフィルタで "取引先" を選択
  - Expected: タグ "取引先" 付きの 2 件のみ表示される

- **test_search_filter_by_relationship**: Relationship でフィルタリングできる
  - Setup: Relationship "建築士会/桑名支部" 付き名刺 2 件
  - Steps:
    1. Relationship フィルタで "桑名支部" を選択
  - Expected: 該当の 2 件のみ表示される

- **test_search_combined_text_and_filter**: テキスト + フィルタの複合検索
  - Setup: タグ "取引先" 付き "田中太郎"、タグ "取引先" 付き "佐藤花子"、タグ "友人" 付き "田中次郎"
  - Steps:
    1. 検索バーに "田中" を入力
    2. タグフィルタで "取引先" を選択
  - Expected: "田中太郎" のみ表示される

- **test_search_no_results**: 該当なしで空メッセージ表示
  - Steps:
    1. 検索バーに "存在しないキーワード" を入力
  - Expected: "検索結果がありません" 等のメッセージが表示される

- **test_search_clear_restores_all**: 検索クリアで全件表示に戻る
  - Setup: 名刺 5 件
  - Steps:
    1. "田中" で検索
    2. クリアボタンをクリック
  - Expected: 全 5 件が表示される

---

## Playwright: OCR フロー

> ファイル: `e2e/ocr.spec.ts`

### 正常系

- **test_camera_capture_to_corner_selection**: カメラ撮影 → 四隅選択画面へ遷移
  - Setup: ログイン済み、カメラ権限許可
  - Steps:
    1. `/namecards/new` に遷移
    2. カメラボタンをクリック
    3. 撮影ボタンをクリック
  - Expected: 四隅選択 UI（CornerSelector）が表示される

- **test_corner_selection_to_ocr_result**: 四隅確定 → OCR 結果表示
  - Setup: カメラ撮影済み
  - Steps:
    1. 四隅選択 UI で "確定" ボタンをクリック
    2. "画像処理中..." ローディング表示
    3. OCR 結果が NameCardForm にプリフィルされる
  - Expected: 氏名、連絡先等のフォームフィールドに値が自動入力される

- **test_ocr_result_edit_and_save**: OCR 結果を編集して保存できる
  - Setup: OCR 結果がプリフィルされた状態
  - Steps:
    1. OCR 結果を確認
    2. 一部フィールドを手動修正
    3. "保存" ボタンをクリック
  - Expected: 修正後のデータで名刺が作成される

- **test_ocr_full_flow**: カメラ → 四隅選択 → OCR → 保存の全フロー
  - Setup: ログイン済み
  - Steps:
    1. `/namecards/new` に遷移
    2. カメラボタンをクリック
    3. 撮影
    4. 四隅を調整
    5. "確定" をクリック
    6. OCR 結果を確認
    7. "保存" をクリック
    8. 名刺詳細ページに遷移
  - Expected: 名刺が正常に作成され、画像が保存されている

### 異常系

- **test_ocr_timeout_shows_error**: OCR タイムアウトでエラーメッセージ
  - Setup: OCR がタイムアウトするシナリオ（モックまたは低速環境）
  - Steps:
    1. カメラ撮影 → 四隅確定
  - Expected: "OCR がタイムアウトしました。再試行してください。" 等のエラーメッセージ

- **test_camera_permission_denied**: カメラ権限拒否でエラー表示
  - Setup: カメラ権限を拒否
  - Steps:
    1. `/namecards/new` に遷移
    2. カメラボタンをクリック
  - Expected: "カメラへのアクセスが許可されていません" 等のエラーメッセージ

---

## Playwright: JSON エクスポート/インポート

> ファイル: `e2e/export-import.spec.ts`

### 正常系

- **test_export_json_download**: JSON ファイルをエクスポートできる
  - Setup: ログイン済み、名刺 5 件 + Relationship + Tag 作成済み
  - Steps:
    1. `/import-export` に遷移
    2. "エクスポート" ボタンをクリック
    3. JSON ファイルがダウンロードされる
  - Expected: ダウンロードされた JSON に `exported_at`, `version`, `relationships`, `tags`, `namecards` が含まれる

- **test_export_json_contains_all_data**: エクスポートに全データが含まれる
  - Setup: 名刺 5 件（contact_methods 付き）、Relationship 3 件、Tag 2 件
  - Steps:
    1. エクスポートを実行
    2. JSON ファイルの内容を検証
  - Expected: namecards に 5 件、relationships に 3 件、tags に 2 件が含まれる

- **test_import_json_upload**: JSON ファイルをインポートできる
  - Setup: ログイン済み、有効なエクスポート JSON ファイル
  - Steps:
    1. `/import-export` に遷移
    2. "インポート" セクションでファイルを選択
    3. "インポート" ボタンをクリック
    4. 結果サマリーが表示される
  - Expected: "インポート完了" メッセージと件数サマリー（imported / skipped）が表示される

- **test_import_json_verify_data**: インポート後にデータが確認できる
  - Setup: 空の状態で JSON をインポート済み
  - Steps:
    1. `/` に遷移
    2. 名刺一覧を確認
    3. `/relationships` に遷移
    4. ツリーを確認
    5. `/tags` に遷移
    6. タグ一覧を確認
  - Expected: インポートされた名刺、Relationship、Tag が全て表示される

- **test_export_import_roundtrip**: エクスポート → インポートでデータが保持される
  - Setup: 名刺 3 件 + Relationship + Tag
  - Steps:
    1. エクスポートを実行
    2. 全データを削除
    3. エクスポートした JSON をインポート
    4. 名刺一覧を確認
  - Expected: 元のデータが復元される（ID は異なる可能性あり）

### 異常系

- **test_import_invalid_json_format**: 不正な JSON ファイルでエラー表示
  - Setup: 不正な構造の JSON ファイル
  - Steps:
    1. `/import-export` に遷移
    2. 不正な JSON ファイルを選択してインポート
  - Expected: "不正な JSON 形式です" 等のエラーメッセージが表示される

- **test_import_empty_file**: 空ファイルでエラー表示
  - Steps:
    1. 空のファイルを選択してインポート
  - Expected: エラーメッセージが表示される

- **test_export_empty_data**: データ 0 件でもエクスポートが成功する
  - Setup: データなし
  - Steps:
    1. エクスポートを実行
  - Expected: 空の配列を含む有効な JSON がダウンロードされる

---

## テストケース集計

### Vitest（ユニット/コンポーネントテスト）

| カテゴリ | コンポーネント | テスト数 |
|---------|--------------|---------|
| UI コンポーネント | Button | 5 |
| UI コンポーネント | Input | 4 |
| UI コンポーネント | Dialog | 3 |
| UI コンポーネント | Select | 3 |
| NameCard | NameCardList | 5 |
| NameCard | NameCardItem | 6 |
| NameCard | NameCardForm | 15 |
| NameCard | NameCardEditDialog | 4 |
| Relationship | RelationshipTree | 8 |
| Relationship | RelationshipSelect | 4 |
| Tag | TagList | 6 |
| Tag | TagSelect | 4 |
| Camera | CameraCapture | 4 |
| Camera | CornerSelector | 4 |
| Search | SearchBar | 4 |
| Hooks | useAuth | 5 |
| Hooks | useToast | 2 |
| API クライアント | client | 3 |
| API クライアント | namecards | 4 |
| API クライアント | search | 2 |
| API クライアント | images | 2 |
| Zod スキーマ | auth | 4 |
| Zod スキーマ | namecard | 5 |
| Zod スキーマ | contact-method | 4 |
| Zod スキーマ | relationship | 3 |
| Zod スキーマ | tag | 2 |
| Zod スキーマ | search | 3 |
| Zod スキーマ | import | 3 |
| **Vitest 合計** | | **121** |

### Playwright（E2E テスト）

| ファイル | 正常系 | 異常系 | 合計 |
|---------|--------|--------|------|
| auth.spec.ts | 3 | 5 | 8 |
| namecards.spec.ts | 8 | 2 | 10 |
| relationships.spec.ts | 5 | 2 | 7 |
| tags.spec.ts | 4 | 2 | 6 |
| search.spec.ts | 8 | 0 | 8 |
| ocr.spec.ts | 4 | 2 | 6 |
| export-import.spec.ts | 5 | 3 | 8 |
| **Playwright 合計** | **37** | **16** | **53** |

### 総合

| テスト種別 | テスト数 |
|-----------|---------|
| Vitest（ユニット/コンポーネント） | 121 |
| Playwright（E2E） | 53 |
| **総合計** | **174** |
