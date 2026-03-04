"use client";

import { Camera, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { imageApi, type ProcessImageResponse } from "@/lib/api/images";
import {
  CONTACT_METHOD_TYPES,
  type ContactMethodFormData,
} from "@/lib/schemas/contact-method";
import type { NamecardCreateFormData } from "@/lib/schemas/namecard";
import { Button } from "../ui/button";
import type { GuideRect } from "./CameraCapture";
import { type CornerPoint, CornerSelector } from "./CornerSelector";
import styles from "./ImageUploadOCR.module.scss";

type FlowStep = "idle" | "corners" | "processing";

/** Business card aspect ratio (landscape) — matches CameraCapture guideFrame */
const CARD_ASPECT = 1.75;

function getDefaultCornersForFile(
  width: number,
  height: number,
  guideRect?: GuideRect,
): CornerPoint[] {
  if (guideRect) {
    return [
      { x: guideRect.x, y: guideRect.y },
      { x: guideRect.x + guideRect.width, y: guideRect.y },
      { x: guideRect.x + guideRect.width, y: guideRect.y + guideRect.height },
      { x: guideRect.x, y: guideRect.y + guideRect.height },
    ];
  }

  const maxW = width * 0.8;
  const maxH = height * 0.8;
  const frameW = Math.min(maxW, maxH * CARD_ASPECT);
  const frameH = frameW / CARD_ASPECT;
  const x0 = (width - frameW) / 2;
  const y0 = (height - frameH) / 2;

  return [
    { x: x0, y: y0 },
    { x: x0 + frameW, y: y0 },
    { x: x0 + frameW, y: y0 + frameH },
    { x: x0, y: y0 + frameH },
  ];
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
}

function getImageNaturalSize(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

interface ImageUploadOCRProps {
  guideRect?: GuideRect;
  onComplete: (ocrData: Partial<NamecardCreateFormData>) => void;
}

export function ImageUploadOCR({ guideRect, onComplete }: ImageUploadOCRProps) {
  const [step, setStep] = useState<FlowStep>("idle");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backgroundOcrRef = useRef<Promise<ProcessImageResponse> | null>(null);

  const startBackgroundOcr = useCallback((dataUrl: string) => {
    const ocrPromise = (async () => {
      const file = await dataUrlToFile(dataUrl, "upload.jpg");
      const { upload_id } = await imageApi.upload(file);
      const { width, height } = await getImageNaturalSize(dataUrl);
      const defaultCorners = getDefaultCornersForFile(width, height, guideRect);
      return imageApi.process({ upload_id, corners: defaultCorners });
    })();
    backgroundOcrRef.current = ocrPromise;
  }, [guideRect]);

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
        const dataUrl = reader.result as string;
        setSelectedImage(dataUrl);
        setStep("corners");
        startBackgroundOcr(dataUrl);
      };
      reader.onerror = () => {
        setError("ファイルの読み込みに失敗しました");
      };
      reader.readAsDataURL(file);

      // Reset input so the same file can be re-selected
      e.target.value = "";
    },
    [startBackgroundOcr],
  );

  const handleCornersConfirm = useCallback(
    async (corners: CornerPoint[]) => {
      if (!selectedImage) return;

      setStep("processing");
      setError(null);

      try {
        const ocrPromise = backgroundOcrRef.current;
        if (!ocrPromise) {
          throw new Error("OCR processing not started");
        }
        const backgroundResult = await ocrPromise;

        const file = await dataUrlToFile(selectedImage, "upload.jpg");
        const { upload_id } = await imageApi.upload(file);
        const { image_path } = await imageApi.process({
          upload_id,
          corners,
        });

        const ocr_result = backgroundResult.ocr_result;

        const formData: Partial<NamecardCreateFormData> = {
          first_name: ocr_result.first_name ?? "",
          last_name: ocr_result.last_name ?? "",
          first_name_kana: ocr_result.first_name_kana ?? "",
          last_name_kana: ocr_result.last_name_kana ?? "",
          company_name: ocr_result.company_name ?? "",
          department: ocr_result.department ?? "",
          position: ocr_result.position ?? "",
          memo: ocr_result.memo ?? "",
          image_path: image_path ?? undefined,
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
        backgroundOcrRef.current = null;
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
    backgroundOcrRef.current = null;
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
          guideRect={guideRect}
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
