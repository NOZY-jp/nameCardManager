"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ImageUploadOCR } from "@/components/camera";
import { NameCardForm } from "@/components/namecard";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { createNameCard, type NameCardCreateData } from "@/lib/api/namecards";
import { getRelationships } from "@/lib/api/relationships";
import { getTags } from "@/lib/api/tags";
import type { NamecardCreateFormData } from "@/lib/schemas/namecard";
import styles from "./new.module.scss";

export default function NewNameCardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [relationships, setRelationships] = useState<
    Array<{
      id: string;
      node_name: string;
      parent_id?: string | null;
      children?: Array<{
        id: string;
        node_name: string;
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
      toast({ type: "success", message: "OCR結果をフォームに反映しました" });
    },
    [toast],
  );

  const handleSubmit = async (data: NamecardCreateFormData) => {
    setSubmitting(true);
    try {
      await createNameCard(data as unknown as NameCardCreateData);
      toast({ type: "success", message: "名刺を登録しました" });
      router.push("/namecards");
    } catch {
      toast({ type: "error", message: "登録に失敗しました" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link href="/namecards" className={styles.backLink}>
          <ArrowLeft size={18} />
          名刺一覧に戻る
        </Link>
        <h1 className={styles.title}>名刺を新規登録</h1>
      </div>

      <div className={styles.ocrSection}>
        <ImageUploadOCR onComplete={handleOCRComplete} />
      </div>

      <div className={styles.formContainer}>
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
    </div>
  );
}
