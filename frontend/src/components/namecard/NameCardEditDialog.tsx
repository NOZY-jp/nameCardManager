"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { namecardCreateSchema, type NamecardCreateFormData } from "@/lib/schemas/namecard";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NameCard } from "@/lib/api/namecards";
import styles from "./NameCardEditDialog.module.scss";

interface NameCardEditDialogProps {
  card: NameCard;
  open: boolean;
  onSave: (data: NamecardCreateFormData) => void;
  onClose: () => void;
}

export function NameCardEditDialog({
  card,
  open,
  onSave,
  onClose,
}: NameCardEditDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NamecardCreateFormData>({
    resolver: zodResolver(namecardCreateSchema),
    defaultValues: {
      first_name: card.first_name ?? "",
      last_name: card.last_name ?? "",
      first_name_kana: card.first_name_kana ?? "",
      last_name_kana: card.last_name_kana ?? "",
      company_name: card.company_name ?? "",
      department: card.department ?? "",
      position: card.position ?? "",
      memo: card.memo ?? "",
    },
  });

  const handleFormSubmit = (data: NamecardCreateFormData) => {
    onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className={styles.dialogContent}>
        <DialogTitle>名刺を編集</DialogTitle>

        <form
          className={styles.form}
          onSubmit={handleSubmit(handleFormSubmit)}
          noValidate
        >
          <div className={styles.fieldRow}>
            <div className={styles.fieldGroup}>
              <Label htmlFor="edit-last_name" required>姓</Label>
              <Input
                id="edit-last_name"
                {...register("last_name")}
              />
              {errors.last_name && (
                <span className={styles.error}>{errors.last_name.message}</span>
              )}
            </div>
            <div className={styles.fieldGroup}>
              <Label htmlFor="edit-first_name" required>名</Label>
              <Input
                id="edit-first_name"
                {...register("first_name")}
              />
              {errors.first_name && (
                <span className={styles.error}>{errors.first_name.message}</span>
              )}
            </div>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.fieldGroup}>
              <Label htmlFor="edit-last_name_kana">カナ</Label>
              <Input id="edit-last_name_kana" {...register("last_name_kana")} />
            </div>
            <div className={styles.fieldGroup}>
              <Label htmlFor="edit-first_name_kana">ふりがな</Label>
              <Input id="edit-first_name_kana" {...register("first_name_kana")} />
            </div>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.fieldGroup}>
              <span className={styles.visualLabel}>会社名</span>
              <Input placeholder="会社名" {...register("company_name")} />
            </div>
            <div className={styles.fieldGroup}>
              <Label htmlFor="edit-position">役職</Label>
              <Input id="edit-position" {...register("position")} />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <Label htmlFor="edit-department">部署</Label>
            <Input id="edit-department" {...register("department")} />
          </div>

          <div className={styles.fieldGroup}>
            <Label htmlFor="edit-memo">メモ</Label>
            <textarea
              id="edit-memo"
              className={styles.form}
              {...register("memo")}
            />
          </div>

          <div className={styles.actions}>
            <Button type="button" variant="outline" onClick={onClose}>
              キャンセル
            </Button>
            <Button type="submit">保存</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
