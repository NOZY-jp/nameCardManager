"use client";

import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exportJSON } from "@/lib/api/export";
import { type ImportResult, importJSON } from "@/lib/api/import";
import styles from "./import-export.module.scss";

export default function ImportExportPage() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setExporting(true);
    setError("");
    try {
      const data = await exportJSON();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `namecard-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError("エクスポートに失敗しました");
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError("");
    setResult(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await importJSON(data);
      setResult(res);
    } catch {
      setError("インポートに失敗しました。JSONファイルを確認してください。");
    } finally {
      setImporting(false);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  };

  return (
    <div className={styles.page}>
      <Card>
        <CardHeader>
          <CardTitle>データのエクスポート/インポート</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.actions}>
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>エクスポート</h3>
              <p className={styles.sectionDesc}>
                すべてのデータをJSONファイルとしてダウンロードします。
              </p>
              <Button
                onClick={handleExport}
                loading={exporting}
                variant="outline"
              >
                <Download size={16} />
                エクスポート
              </Button>
            </div>

            <div className={styles.divider} />

            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>インポート</h3>
              <p className={styles.sectionDesc}>
                JSONファイルからデータを読み込みます。
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                className={styles.fileInput}
                onChange={handleImport}
                disabled={importing}
              />
              <Button
                variant="outline"
                loading={importing}
                onClick={() => fileRef.current?.click()}
                type="button"
              >
                <Upload size={16} />
                インポート
              </Button>
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          {result && (
            <div className={styles.result}>
              <h4 className={styles.resultTitle}>インポート結果</h4>
              <dl className={styles.resultGrid}>
                <dt>所属・関係性</dt>
                <dd>{result.relationships_created} 件</dd>
                <dt>タグ</dt>
                <dd>{result.tags_created} 件</dd>
                <dt>名刺</dt>
                <dd>{result.namecards_created} 件</dd>
              </dl>
              {result.errors.length > 0 && (
                <div className={styles.resultErrors}>
                  <p>エラー ({result.errors.length} 件):</p>
                  <ul>
                    {result.errors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
