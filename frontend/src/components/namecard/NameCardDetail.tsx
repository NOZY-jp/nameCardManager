"use client";

import { ArrowLeft, Edit, Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { NameCard } from "@/lib/api/namecards";
import styles from "./NameCardDetail.module.scss";

interface NameCardDetailProps {
  card: NameCard;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function NameCardDetail({
  card,
  onEdit,
  onDelete,
}: NameCardDetailProps) {
  const router = useRouter();

  const fullName = `${card.last_name} ${card.first_name}`;
  const kanaName =
    card.last_name_kana || card.first_name_kana
      ? `${card.last_name_kana ?? ""} ${card.first_name_kana ?? ""}`.trim()
      : null;

  const imageSrc = card.image_front_url || card.image_path || null;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  return (
    <div className={styles.detail}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <h1 className={styles.name}>{fullName}</h1>
          {kanaName && <span className={styles.nameKana}>{kanaName}</span>}
        </div>

        <div className={styles.headerActions}>
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft size={16} />
            戻る
          </Button>
          {onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit size={16} />
              編集
            </Button>
          )}
          {onDelete && (
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 size={16} />
              削除
            </Button>
          )}
        </div>
      </div>

      {imageSrc && (
        <div className={styles.imageSection}>
          <Image
            src={imageSrc}
            alt={`${fullName}の名刺`}
            width={600}
            height={375}
          />
        </div>
      )}

      {(card.company_name || card.department || card.position) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>所属情報</h2>
          <div className={styles.fieldGrid}>
            {card.company_name && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>会社名</span>
                <span className={styles.fieldValue}>{card.company_name}</span>
              </div>
            )}
            {card.department && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>部署</span>
                <span className={styles.fieldValue}>{card.department}</span>
              </div>
            )}
            {card.position && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>役職</span>
                <span className={styles.fieldValue}>{card.position}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {card.relationships?.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>関係</h2>
          <div className={styles.relationshipList}>
            {card.relationships.map((rel) => {
              const parts = (rel.full_path || rel.name || "").split("/");
              return (
                <div key={rel.id} className={styles.relationshipPath}>
                  {parts.map((part, idx) => (
                    <span key={`${rel.id}-${part}`} className={styles.relationshipSegment}>
                      {idx > 0 && (
                        <span className={styles.relationshipSeparator}>
                          /
                        </span>
                      )}
                      <span
                        className={
                          idx === parts.length - 1
                            ? styles.relationshipLeaf
                            : styles.relationshipAncestor
                        }
                      >
                        {part}
                      </span>
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {card.contact_methods?.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>連絡先</h2>
          <ul className={styles.contactList}>
            {card.contact_methods.map((cm, idx) => (
              <li key={cm.id ?? idx} className={styles.contactItem}>
                <span className={styles.contactType}>{cm.type}</span>
                <span className={styles.contactValue}>{cm.value}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {card.tags?.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>タグ</h2>
          <div className={styles.tagList}>
            {card.tags.map((tag) => (
              <span key={tag.id} className={styles.tag}>
                {tag.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {(card.memo || card.met_notes) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>メモ</h2>
          {card.memo && <p className={styles.memo}>{card.memo}</p>}
          {card.met_notes && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>出会いメモ</span>
              <p className={styles.memo}>{card.met_notes}</p>
            </div>
          )}
        </section>
      )}

      <div className={styles.dates}>
        <span>作成: {formatDate(card.created_at)}</span>
        <span>更新: {formatDate(card.updated_at)}</span>
      </div>
    </div>
  );
}
