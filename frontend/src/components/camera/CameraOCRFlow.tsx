"use client";

import { useCallback, useState } from "react";
import { imageApi } from "@/lib/api/images";
import type { NamecardCreateFormData } from "@/lib/schemas/namecard";
import { CameraCapture } from "./CameraCapture";
import styles from "./CameraOCRFlow.module.scss";
import { type CornerPoint, CornerSelector } from "./CornerSelector";

type FlowStep = "camera" | "corners" | "processing";

interface CameraOCRFlowProps {
  onComplete: (ocrData: Partial<NamecardCreateFormData>) => void;
  onCancel?: () => void;
}

export function CameraOCRFlow({ onComplete, onCancel }: CameraOCRFlowProps) {
  const [step, setStep] = useState<FlowStep>("camera");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCapture = useCallback((imageData: string) => {
    setCapturedImage(imageData);
    setStep("corners");
  }, []);

  const handleCornersConfirm = useCallback(
    async (corners: CornerPoint[]) => {
      if (!capturedImage) return;

      setStep("processing");
      setError(null);

      try {
        // Convert data URL to File
        const res = await fetch(capturedImage);
        const blob = await res.blob();
        const file = new File([blob], "capture.jpg", { type: "image/jpeg" });

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
          contact_methods: ocr_result.contact_methods?.map((cm) => ({
            type: cm.type as
              | "email"
              | "phone"
              | "mobile"
              | "fax"
              | "url"
              | "other",
            value: cm.value,
            is_primary: false,
          })),
        };

        onComplete(formData);
      } catch (_err) {
        setError("OCR処理に失敗しました。もう一度お試しください。");
        setStep("corners");
      }
    },
    [capturedImage, onComplete],
  );

  const handleBackToCamera = useCallback(() => {
    setCapturedImage(null);
    setStep("camera");
  }, []);

  if (step === "camera") {
    return <CameraCapture onCapture={handleCapture} onClose={onCancel} />;
  }

  if (step === "corners" && capturedImage) {
    return (
      <div className={styles.container}>
        {error && <p className={styles.error}>{error}</p>}
        <CornerSelector
          image={capturedImage}
          onConfirm={handleCornersConfirm}
          onBack={handleBackToCamera}
        />
      </div>
    );
  }

  // Processing state
  return (
    <div className={styles.processingState}>
      <div className={styles.spinner} />
      <p className={styles.processingText}>OCR処理中...</p>
    </div>
  );
}
