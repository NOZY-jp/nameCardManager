"use client";

import { CreditCard } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { NameCard } from "@/lib/api/namecards";
import styles from "./NameCardItem.module.scss";

interface NameCardItemProps {
  card: NameCard;
}

export function NameCardItem({ card }: NameCardItemProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/namecards/${card.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  const fullName = `${card.last_name} ${card.first_name}`;
  const imageSrc = card.image_path || card.image_front_url || null;

  const companyParts = [
    card.company_name,
    card.department,
    card.position,
  ].filter(Boolean);

  return (
    // biome-ignore lint/a11y/useSemanticElements: listitem role on interactive element for list semantics
    <div
      className={styles.item}
      role="listitem"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.thumbnail}>
        {imageSrc ? (
          <Image src={imageSrc} alt={fullName} width={80} height={50} />
        ) : (
          <div
            className={styles.placeholderIcon}
            data-testid="namecard-placeholder-icon"
          >
            <CreditCard size={24} />
          </div>
        )}
      </div>

      <div className={styles.body}>
        <span className={styles.name}>{fullName}</span>

        {companyParts.length > 0 && (
          <span className={styles.company}>{companyParts.join(" / ")}</span>
        )}

        <div className={styles.meta}>
          {card.tags?.map((tag) => (
            <span key={tag.id} className={styles.tag}>
              {tag.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
