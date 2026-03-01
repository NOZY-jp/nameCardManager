import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import styles from "./help.module.scss";

export default function HelpPage() {
  return (
    <div className={styles.page}>
      <Card>
        <CardHeader>
          <CardTitle>使い方ガイド</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.content}>
            <section className={styles.section}>
              <h3 className={styles.heading}>名刺の登録</h3>
              <p>
                名刺一覧画面の「新規登録」ボタンから名刺を登録できます。
                氏名は必須項目です。会社名、部署、役職、メモなどの情報も入力できます。
              </p>
            </section>

            <section className={styles.section}>
              <h3 className={styles.heading}>名刺の検索</h3>
              <p>
                検索バーに名前や会社名を入力すると、リアルタイムで名刺を検索できます。
                タグや所属でフィルタリングすることもできます。
              </p>
            </section>

            <section className={styles.section}>
              <h3 className={styles.heading}>所属・関係性の管理</h3>
              <p>
                所属・関係性はツリー構造で管理できます。
                階層を作成して名刺に紐づけることで、組織やグループ単位で名刺を整理できます。
              </p>
              <ul className={styles.list}>
                <li>ノード名をダブルクリックで名前を変更</li>
                <li>子ノードがないノードは削除可能</li>
                <li>「追加」ボタンで新しいノードを追加</li>
              </ul>
            </section>

            <section className={styles.section}>
              <h3 className={styles.heading}>タグの管理</h3>
              <p>
                タグを作成して名刺に紐づけることで、自由にカテゴリ分けができます。
              </p>
              <ul className={styles.list}>
                <li>タグ名をダブルクリックで名前を変更</li>
                <li>削除ボタンでタグを削除</li>
                <li>入力欄に名前を入れて「追加」で新規作成</li>
              </ul>
            </section>

            <section className={styles.section}>
              <h3 className={styles.heading}>データのエクスポート/インポート</h3>
              <p>
                エクスポート機能ですべてのデータをJSON形式でダウンロードできます。
                インポート機能でJSONファイルからデータを復元できます。
              </p>
            </section>

            <section className={styles.section}>
              <h3 className={styles.heading}>連絡先</h3>
              <p>
                名刺には複数の連絡先（メール、電話番号、住所など）を登録できます。
                それぞれにラベルを付けて管理できます。
              </p>
            </section>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
