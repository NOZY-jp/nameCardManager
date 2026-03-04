"use client";

import { RefreshCw, Trash2 } from "lucide-react";
import { AuthImage } from "@/components/ui/auth-image";
import { Button } from "@/components/ui/button";
import type { NameCardImageData } from "@/lib/api/namecards";
import styles from "./ImageGallery.module.scss";

interface ImageGalleryProps {
  namecardId: string;
  images: NameCardImageData[];
  onDeleteImage?: (imageId: number) => void;
  onChangeImage?: (imageId: number) => void;
}

export function ImageGallery({
  namecardId,
  images,
  onDeleteImage,
  onChangeImage,
}: ImageGalleryProps) {
  if (images.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>画像がありません</p>
      </div>
    );
  }

  const sortedImages = [...images].sort((a, b) => a.position - b.position);

  return (
    <div className={styles.gallery}>
      {sortedImages.map((image, index) => (
        <div key={image.id} className={styles.imageItem}>
          <div className={styles.imageContainer}>
            <AuthImage
              apiPath={`/images/${namecardId}${index === 0 ? "" : `?image_id=${image.id}`}`}
              alt={`名刺画像 ${index + 1}`}
              width={600}
              height={375}
              style={{ maxWidth: "100%", height: "auto" }}
            />
          </div>

          {(onDeleteImage || onChangeImage) && (
            <div className={styles.imageActions}>
              {onChangeImage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChangeImage(image.id)}
                >
                  <RefreshCw size={14} />
                  変更
                </Button>
              )}
              {onDeleteImage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onDeleteImage(image.id)}
                  className={styles.deleteButton}
                >
                  <Trash2 size={14} />
                  削除
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
