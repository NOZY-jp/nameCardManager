"use client";

import { useCallback, useRef, useState } from "react";
import { imageApi, type ProcessImageResponse } from "@/lib/api/images";
import {
  CONTACT_METHOD_TYPES,
  type ContactMethodFormData,
} from "@/lib/schemas/contact-method";
import type { NamecardCreateFormData } from "@/lib/schemas/namecard";
import { CameraCapture, type GuideRect } from "./CameraCapture";
import styles from "./CameraOCRFlow.module.scss";
import { type CornerPoint, CornerSelector } from "./CornerSelector";

type FlowStep = "camera" | "corners" | "processing";

/** Business card aspect ratio (landscape) — matches CameraCapture guideFrame */
const CARD_ASPECT = 1.75;

function getDefaultCornersFromGuideRect(
  guideRect: GuideRect | null,
  width: number,
  height: number,
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

interface CameraOCRFlowProps {
  onComplete: (ocrData: Partial<NamecardCreateFormData>) => void;
  onCancel?: () => void;
}

export function CameraOCRFlow({ onComplete, onCancel }: CameraOCRFlowProps) {
  const [step, setStep] = useState<FlowStep>("camera");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [guideRect, setGuideRect] = useState<GuideRect | null>(null);
  const [error, setError] = useState<string | null>(null);
  const backgroundOcrRef = useRef<Promise<ProcessImageResponse> | null>(null);

  const startBackgroundOcr = useCallback(
    (imageData: string, rect: GuideRect | null) => {
      const ocrPromise = (async () => {
        const res = await fetch(imageData);
        const blob = await res.blob();
        const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
        const { upload_id } = await imageApi.upload(file);
        const { width, height } = await getImageNaturalSize(imageData);
        const defaultCorners = getDefaultCornersFromGuideRect(rect, width, height);
        return imageApi.process({ upload_id, corners: defaultCorners });
      })();
      backgroundOcrRef.current = ocrPromise;
    },
    [],
  );

  const handleCapture = useCallback(
    (imageData: string, rect?: GuideRect) => {
      setCapturedImage(imageData);
      setGuideRect(rect ?? null);
      setStep("corners");
      startBackgroundOcr(imageData, rect ?? null);
    },
    [startBackgroundOcr],
  );

  const handleCornersConfirm = useCallback(
    async (corners: CornerPoint[]) => {
      if (!capturedImage) return;

      setStep("processing");
      setError(null);

      try {
        const ocrPromise = backgroundOcrRef.current;
        if (!ocrPromise) {
          throw new Error("OCR processing not started");
        }
        const backgroundResult = await ocrPromise;

        const res = await fetch(capturedImage);
        const blob = await res.blob();
        const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
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
            .filter(
              (cm): cm is NonNullable<typeof cm> => cm !== null,
            ),
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
    backgroundOcrRef.current = null;
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
          guideRect={guideRect ?? undefined}
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
