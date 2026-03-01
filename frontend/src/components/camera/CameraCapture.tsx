"use client";

import { Camera, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import styles from "./CameraCapture.module.scss";

interface CameraCaptureProps {
  onCapture: (imageData: string) => void;
  onClose?: () => void;
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
          };
          setIsReady(true);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          setError("カメラへのアクセスが許可されていません");
        } else {
          setError("カメラの起動に失敗しました");
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [stopStream]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0);
    }

    setFlash(true);
    setTimeout(() => setFlash(false), 200);

    const imageData = canvas.toDataURL("image/jpeg", 0.92);
    stopStream();
    onCapture(imageData);
  }, [onCapture, stopStream]);

  const handleClose = useCallback(() => {
    stopStream();
    onClose?.();
  }, [stopStream, onClose]);

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <Camera size={48} />
          <p className={styles.errorMessage}>{error}</p>
          {onClose && (
            <Button variant="outline" onClick={handleClose}>
              閉じる
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.viewfinder}>
        <video
          ref={videoRef}
          className={styles.video}
          autoPlay
          playsInline
          muted
        />

        <canvas ref={canvasRef} className={styles.hiddenCanvas} />

        <section
          className={styles.guideOverlay}
          data-testid="camera-guide"
          aria-label="撮影ガイド"
        >
          <div className={styles.guideFrame}>
            <span className={`${styles.corner} ${styles.cornerTL}`} />
            <span className={`${styles.corner} ${styles.cornerTR}`} />
            <span className={`${styles.corner} ${styles.cornerBL}`} />
            <span className={`${styles.corner} ${styles.cornerBR}`} />
          </div>
          <p className={styles.guideText}>名刺を枠内に合わせてください</p>
        </section>

        {flash && <div className={styles.flash} />}
      </div>

      <div className={styles.controls}>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            aria-label="閉じる"
            className={styles.closeBtn}
          >
            <X size={24} />
          </Button>
        )}

        <button
          type="button"
          className={styles.captureBtn}
          onClick={handleCapture}
          disabled={!isReady}
          aria-label="撮影"
        >
          <span className={styles.captureBtnInner} />
        </button>

        <div className={styles.spacer} />
      </div>
    </div>
  );
}
