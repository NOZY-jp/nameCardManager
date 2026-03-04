"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { NameCard } from "@/lib/api/namecards";
import type { CONTACT_METHOD_TYPES } from "@/lib/schemas/contact-method";
import type { NamecardCreateFormData } from "@/lib/schemas/namecard";
import { NameCardForm } from "./NameCardForm";
import styles from "./NameCardEditDialog.module.scss";

interface RelationshipOption {
  id: string;
  name: string;
  parent_id?: string | null;
  full_path?: string;
  children?: RelationshipOption[];
}

interface TagOption {
  id: string;
  name: string;
}

interface NameCardEditDialogProps {
  card: NameCard;
  open: boolean;
  onSave: (data: NamecardCreateFormData) => void;
  onClose: () => void;
  relationships?: RelationshipOption[];
  tags?: TagOption[];
}

export function NameCardEditDialog({
  card,
  open,
  onSave,
  onClose,
  relationships = [],
  tags = [],
}: NameCardEditDialogProps) {
  const defaultValues = {
    first_name: card.first_name ?? "",
    last_name: card.last_name ?? "",
    first_name_kana: card.first_name_kana ?? "",
    last_name_kana: card.last_name_kana ?? "",
    company_name: card.company_name ?? "",
    department: card.department ?? "",
    position: card.position ?? "",
    memo: card.memo ?? "",
    contact_methods:
      card.contact_methods?.map((cm) => ({
        type: cm.type as (typeof CONTACT_METHOD_TYPES)[number],
        value: cm.value,
        label: cm.label,
      })) ?? [],
    relationship_ids: card.relationships?.map((r) => Number(r.id)) ?? [],
    tag_ids: card.tags?.map((t) => Number(t.id)) ?? [],
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className={styles.dialogContent}>
        <DialogTitle>名刺を編集</DialogTitle>
        <div className={styles.formWrapper}>
          <NameCardForm
            defaultValues={defaultValues}
            relationships={relationships}
            tags={tags}
            onSubmit={onSave}
            submitLabel="保存"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
