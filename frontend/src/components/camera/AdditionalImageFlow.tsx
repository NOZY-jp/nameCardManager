"use client";

import { Camera, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { imageApi } from "@/lib/api/images";
import { Button } from "../ui/button";
import { CameraCapture, type GuideRect } from "./CameraCapture";
import { type CornerPoint, CornerSelector } from "./CornerSelector";
import styles from "./AdditionalImageFlow.module.scss";

type FlowStep = "select" | "camera" | "corners" | "processing";

const CARD_ASPECT = 1.75;

function getDefaultCornersForImage(
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

interface AdditionalImageFlowProps {
  source: "file" | "camera";
  onComplete: (imagePath: string) => void;
  onCancel: () => void;
}

export function AdditionalImageFlow({
  source,
  onComplete,
  onCancel,
}: AdditionalImageFlowProps) {
  const initialStep: FlowStep = source === "camera" ? "camera" : "select";
  const [step, setStep] = useState<FlowStep>(initialStep);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [guideRect, setGuideRect] = useState<GuideRect | null>(null);
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
        const dataUrl = reader.result as string;
        setCapturedImage(dataUrl);
        setStep("corners");
      };
      reader.onerror = () => {
        setError("ファイルの読み込みに失敗しました");
      };
      reader.readAsDataURL(file);

      e.target.value = "";
    },
    [],
  );

  const handleCameraCapture = useCallback(
    (imageData: string, rect?: GuideRect) => {
      setCapturedImage(imageData);
      setGuideRect(rect ?? null);
      setStep("corners");
    },
    [],
  );

  const handleCornersConfirm = useCallback(
    async (corners: CornerPoint[]) => {
      if (!capturedImage) return;

      setStep("processing");
      setError(null);

      try {
        const file = await dataUrlToFile(capturedImage, "additional.jpg");
        const { upload_id } = await imageApi.upload(file);
        const { image_path } = await imageApi.processAdditional({
          upload_id,
          corners,
        });

        onComplete(image_path);
      } catch (_err) {
        setError("画像処理に失敗しました。もう一度お試しください。");
        setStep("corners");
      }
    },
    [capturedImage, onComplete],
  );

  const handleBackToSelect = useCallback(() => {
    setCapturedImage(null);
    setGuideRect(null);
    setError(null);
    if (source === "camera") {
      setStep("camera");
    } else {
      setStep("select");
    }
  }, [source]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  if (step === "camera") {
    return (
      <CameraCapture onCapture={handleCameraCapture} onClose={onCancel} />
    );
  }

  if (step === "corners" && capturedImage) {
    return (
      <div className={styles.container}>
        {error && <p className={styles.error}>{error}</p>}
        <CornerSelector
          image={capturedImage}
          guideRect={guideRect ?? undefined}
          onConfirm={handleCornersConfirm}
          onBack={handleBackToSelect}
        />
      </div>
    );
  }

  if (step === "processing") {
    return (
      <div className={styles.processingState}>
        <div className={styles.spinner} />
        <p className={styles.processingText}>画像処理中...</p>
      </div>
    );
  }

  return (
    <div className={styles.selectArea}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className={styles.hiddenInput}
      />

      {error && <p className={styles.errorInline}>{error}</p>}

      <div className={styles.selectActions}>
        <Button type="button" variant="outline" onClick={handleUploadClick}>
          <Upload size={18} />
          画像を選択
        </Button>
        <p className={styles.selectHint}>
          <Camera size={14} />
          名刺画像を選択してください（OCRは実行されません）
        </p>
      </div>

      <div className={styles.cancelAction}>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          キャンセル
        </Button>
      </div>
    </div>
  );
}
