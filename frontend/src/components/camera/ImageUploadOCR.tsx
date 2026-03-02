"use client";

import { Camera, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { imageApi } from "@/lib/api/images";
import {
  CONTACT_METHOD_TYPES,
  type ContactMethodFormData,
} from "@/lib/schemas/contact-method";
import type { NamecardCreateFormData } from "@/lib/schemas/namecard";
import { Button } from "../ui/button";
import { type CornerPoint, CornerSelector } from "./CornerSelector";
import styles from "./ImageUploadOCR.module.scss";

type FlowStep = "idle" | "corners" | "processing";

interface ImageUploadOCRProps {
  onComplete: (ocrData: Partial<NamecardCreateFormData>) => void;
}

export function ImageUploadOCR({ onComplete }: ImageUploadOCRProps) {
  const [step, setStep] = useState<FlowStep>("idle");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        setError("画像ファイルを選択してください");
        return;
      }

      setError(null);
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImage(reader.result as string);
        setStep("corners");
      };
      reader.onerror = () => {
        setError("ファイルの読み込みに失敗しました");
      };
      reader.readAsDataURL(file);

      // Reset input so the same file can be re-selected
      e.target.value = "";
    },
    [],
  );

  const handleCornersConfirm = useCallback(
    async (corners: CornerPoint[]) => {
      if (!selectedImage) return;

      setStep("processing");
      setError(null);

      try {
        // Convert data URL to File
        const res = await fetch(selectedImage);
        const blob = await res.blob();
        const file = new File([blob], "upload.jpg", { type: blob.type });

        // Upload image
        const { upload_id } = await imageApi.upload(file);

        // Process with corners
        const { ocr_result } = await imageApi.process({
          upload_id,
          corners,
        });

        // Map OCR result to form data
        const formData: Partial<NamecardCreateFormData> = {
          first_name: ocr_result.first_name ?? "",
          last_name: ocr_result.last_name ?? "",
          first_name_kana: ocr_result.first_name_kana ?? "",
          last_name_kana: ocr_result.last_name_kana ?? "",
          company_name: ocr_result.company_name ?? "",
          department: ocr_result.department ?? "",
          position: ocr_result.position ?? "",
          memo: ocr_result.memo ?? "",
          contact_methods: ocr_result.contact_methods
            ?.map((cm) => {
              const type = cm.type as ContactMethodFormData["type"];
              if (
                !(CONTACT_METHOD_TYPES as readonly string[]).includes(cm.type)
              ) {
                return null;
              }
              return {
                type,
                value: cm.value,
                is_primary: false,
              };
            })
            .filter((cm): cm is NonNullable<typeof cm> => cm !== null),
        };

        setStep("idle");
        setSelectedImage(null);
        onComplete(formData);
      } catch (_err) {
        setError("OCR処理に失敗しました。もう一度お試しください。");
        setStep("corners");
      }
    },
    [selectedImage, onComplete],
  );

  const handleBackToUpload = useCallback(() => {
    setSelectedImage(null);
    setStep("idle");
    setError(null);
  }, []);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  if (step === "corners" && selectedImage) {
    return (
      <div className={styles.cornerWrapper}>
        {error && <p className={styles.error}>{error}</p>}
        <CornerSelector
          image={selectedImage}
          onConfirm={handleCornersConfirm}
          onBack={handleBackToUpload}
        />
      </div>
    );
  }

  if (step === "processing") {
    return (
      <div className={styles.processingState}>
        <div className={styles.spinner} />
        <p className={styles.processingText}>OCR処理中...</p>
      </div>
    );
  }

  // Idle state — show upload button
  return (
    <div className={styles.uploadArea}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className={styles.hiddenInput}
        data-testid="image-upload-input"
      />

      {error && <p className={styles.errorInline}>{error}</p>}

      <div className={styles.uploadActions}>
        <Button
          type="button"
          variant="outline"
          onClick={handleUploadClick}
          data-testid="image-upload-button"
        >
          <Upload size={18} />
          画像をアップロード
        </Button>
        <p className={styles.uploadHint}>
          <Camera size={14} />
          名刺の画像を選択すると、OCRで自動入力します
        </p>
      </div>
    </div>
  );
}
