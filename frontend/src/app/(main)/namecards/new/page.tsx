"use client";

import { ArrowLeft, Camera, ImageIcon, PenLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CameraOCRFlow, ImageUploadOCR } from "@/components/camera";
import { NameCardForm } from "@/components/namecard";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { createNameCard, type NameCardCreateData } from "@/lib/api/namecards";
import { getRelationships } from "@/lib/api/relationships";
import { getTags } from "@/lib/api/tags";
import type { NamecardCreateFormData } from "@/lib/schemas/namecard";
import styles from "./new.module.scss";

type InputMode = "choose" | "image" | "camera" | "manual";

export default function NewNameCardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = useState<InputMode>("choose");
  const [relationships, setRelationships] = useState<
    Array<{
      id: string;
      name: string;
      parent_id?: string | null;
      children?: Array<{
        id: string;
        name: string;
        parent_id?: string | null;
      }>;
    }>
  >([]);
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [ocrDefaults, setOcrDefaults] =
    useState<Partial<NamecardCreateFormData> | null>(null);
  const [formKey, setFormKey] = useState(0);

  const fetchOptions = useCallback(async () => {
    try {
      const [rels, tgs] = await Promise.all([getRelationships(), getTags()]);
      setRelationships(rels);
      setTags(tgs);
    } catch {
      // Options are optional; form still works without them
    }
  }, []);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  const handleOCRComplete = useCallback(
    (data: Partial<NamecardCreateFormData>) => {
      setOcrDefaults(data);
      setFormKey((prev) => prev + 1);
      setMode("manual");
      toast({ type: "success", message: "OCR結果をフォームに反映しました" });
    },
    [toast],
  );

  const handleSubmit = async (data: NamecardCreateFormData) => {
    setSubmitting(true);
    try {
      const createData: NameCardCreateData = {
        ...data,
        image_paths: data.image_paths?.length ? data.image_paths : data.image_path ? [data.image_path] : [],
      };
      await createNameCard(createData);
      toast({ type: "success", message: "名刺を登録しました" });
      router.push("/namecards");
    } catch {
      toast({ type: "error", message: "登録に失敗しました" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackToChoose = useCallback(() => {
    setMode("choose");
  }, []);

  // Camera flow: full-screen takeover
  if (mode === "camera") {
    return (
      <CameraOCRFlow
        onComplete={handleOCRComplete}
        onCancel={handleBackToChoose}
      />
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link href="/namecards" className={styles.backLink}>
          <ArrowLeft size={18} />
          名刺一覧に戻る
        </Link>
        <h1 className={styles.title}>名刺を新規登録</h1>
      </div>

      {mode === "choose" && (
        <div className={styles.modeSelector} data-testid="mode-selector">
          <p className={styles.modeSelectorLabel}>登録方法を選択してください</p>
          <div className={styles.modeCards}>
            <button
              type="button"
              className={styles.modeCard}
              onClick={() => setMode("image")}
              data-testid="mode-image"
            >
              <ImageIcon size={28} />
              <span className={styles.modeCardTitle}>画像を選択</span>
              <span className={styles.modeCardDesc}>
                保存済みの画像からOCR読み取り
              </span>
            </button>

            <button
              type="button"
              className={styles.modeCard}
              onClick={() => setMode("camera")}
              data-testid="mode-camera"
            >
              <Camera size={28} />
              <span className={styles.modeCardTitle}>写真を撮影</span>
              <span className={styles.modeCardDesc}>
                カメラで撮影してOCR読み取り
              </span>
            </button>

            <button
              type="button"
              className={styles.modeCard}
              onClick={() => setMode("manual")}
              data-testid="mode-manual"
            >
              <PenLine size={28} />
              <span className={styles.modeCardTitle}>手入力</span>
              <span className={styles.modeCardDesc}>
                フォームに直接入力して登録
              </span>
            </button>
          </div>
        </div>
      )}

      {mode === "image" && (
        <div className={styles.ocrSection}>
          <div className={styles.sectionHeader}>
            <button
              type="button"
              className={styles.backToChoose}
              onClick={handleBackToChoose}
              data-testid="back-to-choose"
            >
              <ArrowLeft size={16} />
              戻る
            </button>
          </div>
          <ImageUploadOCR onComplete={handleOCRComplete} />
        </div>
      )}

      {mode === "manual" && (
        <div className={styles.formContainer}>
          {!ocrDefaults && (
            <div className={styles.sectionHeader}>
              <button
                type="button"
                className={styles.backToChoose}
                onClick={handleBackToChoose}
                data-testid="back-to-choose"
              >
                <ArrowLeft size={16} />
                戻る
              </button>
            </div>
          )}
          <NameCardForm
            key={formKey}
            defaultValues={ocrDefaults ?? undefined}
            relationships={relationships}
            tags={tags}
            onSubmit={handleSubmit}
            submitLabel={submitting ? "登録中..." : "登録"}
          />

          <div className={styles.cancelRow}>
            <Button variant="outline" onClick={() => router.push("/namecards")}>
              キャンセル
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
