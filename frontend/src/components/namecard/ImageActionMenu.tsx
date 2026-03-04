"use client";

import { Camera, ChevronDown, ImagePlus, RefreshCw, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import styles from "./ImageActionMenu.module.scss";

interface ImageActionMenuProps {
  mode: "change" | "add";
  onSelectImage: () => void;
  onCapturePhoto: () => void;
}

export function ImageActionMenu({
  mode,
  onSelectImage,
  onCapturePhoto,
}: ImageActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const label = mode === "change" ? "画像を変更" : "画像を追加";
  const Icon = mode === "change" ? RefreshCw : ImagePlus;

  const toggleMenu = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleSelectImage = useCallback(() => {
    setIsOpen(false);
    onSelectImage();
  }, [onSelectImage]);

  const handleCapturePhoto = useCallback(() => {
    setIsOpen(false);
    onCapturePhoto();
  }, [onCapturePhoto]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const selectLabel =
    mode === "change" ? "画像を選択して変更" : "画像を選択して追加";
  const captureLabel =
    mode === "change" ? "写真を撮影して変更" : "写真を撮影して追加";

  return (
    <div className={styles.menuWrapper} ref={menuRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={toggleMenu}
        className={styles.triggerButton}
      >
        <Icon size={14} />
        {label}
        <ChevronDown size={12} className={isOpen ? styles.chevronOpen : ""} />
      </Button>

      {isOpen && (
        <div className={styles.dropdown}>
          <button
            type="button"
            className={styles.dropdownItem}
            onClick={handleSelectImage}
          >
            <Upload size={14} />
            {selectLabel}
          </button>
          <button
            type="button"
            className={styles.dropdownItem}
            onClick={handleCapturePhoto}
          >
            <Camera size={14} />
            {captureLabel}
          </button>
        </div>
      )}
    </div>
  );
}
