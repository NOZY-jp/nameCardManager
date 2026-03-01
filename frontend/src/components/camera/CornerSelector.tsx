"use client";

import { useCallback, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./CornerSelector.module.scss";

export interface CornerPoint {
  x: number;
  y: number;
}

interface CornerSelectorProps {
  image: string;
  onConfirm: (corners: CornerPoint[]) => void;
  onBack?: () => void;
}

const CORNER_LABELS = ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const;

function getDefaultCorners(width: number, height: number): CornerPoint[] {
  const pad = 0.05;
  return [
    { x: width * pad, y: height * pad },           // topLeft
    { x: width * (1 - pad), y: height * pad },     // topRight
    { x: width * (1 - pad), y: height * (1 - pad) }, // bottomRight
    { x: width * pad, y: height * (1 - pad) },     // bottomLeft
  ];
}

export function CornerSelector({ image, onConfirm, onBack }: CornerSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState({ width: 400, height: 300 });
  const [corners, setCorners] = useState<CornerPoint[]>(() =>
    getDefaultCorners(400, 300),
  );
  const [dragging, setDragging] = useState<number | null>(null);

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      setImageSize({ width: w, height: h });
      setCorners(getDefaultCorners(w, h));
    },
    [],
  );

  const getPointerPosition = useCallback(
    (e: React.PointerEvent | PointerEvent): CornerPoint | null => {
      const container = containerRef.current;
      if (!container) return null;

      const rect = container.getBoundingClientRect();
      const scaleX = imageSize.width / rect.width;
      const scaleY = imageSize.height / rect.height;

      return {
        x: Math.max(0, Math.min(imageSize.width, (e.clientX - rect.left) * scaleX)),
        y: Math.max(0, Math.min(imageSize.height, (e.clientY - rect.top) * scaleY)),
      };
    },
    [imageSize],
  );

  const handlePointerDown = useCallback(
    (index: number) => (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(index);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragging === null) return;
      const pos = getPointerPosition(e);
      if (!pos) return;

      setCorners((prev) =>
        prev.map((c, i) => (i === dragging ? pos : c)),
      );
    },
    [dragging, getPointerPosition],
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  const handleReset = useCallback(() => {
    setCorners(getDefaultCorners(imageSize.width, imageSize.height));
  }, [imageSize]);

  const handleConfirm = useCallback(() => {
    onConfirm(corners);
  }, [corners, onConfirm]);

  const polygonPoints = corners.map((c) => `${c.x},${c.y}`).join(" ");

  return (
    <div className={styles.container}>
      <div
        ref={containerRef}
        className={styles.imageWrapper}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <img
          src={image}
          alt="撮影画像"
          className={styles.image}
          onLoad={handleImageLoad}
          draggable={false}
        />

        <svg
          className={styles.overlay}
          viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="四隅選択"
        >
          <title>四隅選択オーバーレイ</title>
          {/* Darkened area outside selection */}
          <defs>
            <mask id="corner-mask">
              <rect width={imageSize.width} height={imageSize.height} fill="white" />
              <polygon points={polygonPoints} fill="black" />
            </mask>
          </defs>
          <rect
            width={imageSize.width}
            height={imageSize.height}
            fill="rgba(0,0,0,0.4)"
            mask="url(#corner-mask)"
          />

          {/* Edge lines */}
          <polygon
            points={polygonPoints}
            fill="none"
            stroke="var(--color-accent, #e94560)"
            strokeWidth={Math.max(2, imageSize.width * 0.004)}
            strokeLinejoin="round"
          />

          {/* Corner handles */}
          {corners.map((corner, i) => (
            <circle
              key={CORNER_LABELS[i]}
              data-testid={`corner-point-${CORNER_LABELS[i]}`}
              cx={corner.x}
              cy={corner.y}
              r={Math.max(12, imageSize.width * 0.02)}
              className={styles.cornerHandle}
              onPointerDown={handlePointerDown(i)}
            />
          ))}
        </svg>
      </div>

      <div className={styles.actions}>
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            戻る
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={handleReset} aria-label="リセット">
          <RotateCcw size={16} />
          リセット
        </Button>
        <Button onClick={handleConfirm} aria-label="確定">
          確定
        </Button>
      </div>
    </div>
  );
}
