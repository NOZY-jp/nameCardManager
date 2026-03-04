"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONTACT_METHOD_TYPES } from "@/lib/schemas/contact-method";
import {
  type NamecardCreateFormData,
  namecardCreateSchema,
} from "@/lib/schemas/namecard";
import styles from "./NameCardForm.module.scss";

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

interface NameCardFormProps {
  defaultValues?: Partial<
    NamecardCreateFormData & {
      contact_methods: Array<{ type: string; value: string; label?: string }>;
    }
  >;
  relationships?: RelationshipOption[];
  tags?: TagOption[];
  onSubmit?: (data: NamecardCreateFormData) => void;
  submitLabel?: string;
}

function flattenRelationships(
  nodes: RelationshipOption[],
  parentName = "",
): Array<{ id: string; label: string }> {
  const result: Array<{ id: string; label: string }> = [];
  for (const node of nodes) {
    const label = parentName
      ? `${parentName}/${node.name}`
      : node.name;
    result.push({ id: node.id, label });
    if (node.children?.length) {
      result.push(...flattenRelationships(node.children, node.name));
    }
  }
  return result;
}

export function NameCardForm({
  defaultValues,
  relationships = [],
  tags = [],
  onSubmit,
  submitLabel = "登録",
}: NameCardFormProps) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<NamecardCreateFormData>({
    resolver: zodResolver(namecardCreateSchema),
    defaultValues: {
      first_name: defaultValues?.first_name ?? "",
      last_name: defaultValues?.last_name ?? "",
      first_name_kana: defaultValues?.first_name_kana ?? "",
      last_name_kana: defaultValues?.last_name_kana ?? "",
      company_name: defaultValues?.company_name ?? "",
      department: defaultValues?.department ?? "",
      position: defaultValues?.position ?? "",
      memo: defaultValues?.memo ?? "",
      image_path: defaultValues?.image_path ?? "",
      contact_methods:
        defaultValues?.contact_methods?.map((cm) => ({
          type: cm.type as (typeof CONTACT_METHOD_TYPES)[number],
          value: cm.value,
          is_primary: false,
        })) ?? [],
      relationship_ids: defaultValues?.relationship_ids ?? [],
      tag_ids: defaultValues?.tag_ids ?? [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "contact_methods",
  });

  const flatRelationships = flattenRelationships(relationships);

  const [selectedRelIds, setSelectedRelIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const handleFormSubmit = (data: NamecardCreateFormData) => {
    onSubmit?.(data);
  };

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit(handleFormSubmit)}
      noValidate
    >
      <input type="hidden" {...register("image_path")} />
      <div className={styles.fieldRow}>
        <div className={styles.fieldGroup}>
          <Label htmlFor="last_name" required>
            姓
          </Label>
          <Input
            id="last_name"
            {...register("last_name")}
            error={errors.last_name?.message}
          />
        </div>
        <div className={styles.fieldGroup}>
          <Label htmlFor="first_name" required>
            名
          </Label>
          <Input
            id="first_name"
            {...register("first_name")}
            error={errors.first_name?.message}
          />
        </div>
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.fieldGroup}>
          <Label htmlFor="last_name_kana">セイ</Label>
          <Input id="last_name_kana" {...register("last_name_kana")} />
        </div>
        <div className={styles.fieldGroup}>
          <Label htmlFor="first_name_kana">メイ</Label>
          <Input id="first_name_kana" {...register("first_name_kana")} />
        </div>
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.fieldGroup}>
          <span className={styles.visualLabel}>会社名</span>
          <Input placeholder="会社名" {...register("company_name")} />
        </div>
        <div className={styles.fieldGroup}>
          <Label htmlFor="position">役職</Label>
          <Input id="position" {...register("position")} />
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <Label htmlFor="department">部署</Label>
        <Input id="department" {...register("department")} />
      </div>

      <div className={styles.fieldGroup}>
        <Label htmlFor="memo">メモ</Label>
        <textarea id="memo" className={styles.textarea} {...register("memo")} />
      </div>

      <div className={styles.contactSection}>
        <div className={styles.contactHeader}>
          <span className={styles.contactTitle}>連絡先</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              append({ type: "email", value: "", is_primary: false })
            }
          >
            連絡先を追加
          </Button>
        </div>

        {fields.map((field, index) => (
          <div
            key={field.id}
            className={styles.contactRow}
            data-testid="contact-method-row"
          >
            <div className={styles.contactType}>
              <Select
                value={watch(`contact_methods.${index}.type`)}
                onValueChange={(val) => {
                  setValue(
                    `contact_methods.${index}.type` as const,
                    val as (typeof CONTACT_METHOD_TYPES)[number],
                    { shouldValidate: true, shouldDirty: true },
                  );
                }}
              >
                <SelectTrigger aria-label="タイプ">
                  <SelectValue placeholder="タイプ" />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_METHOD_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className={styles.contactValue}>
              <Input
                placeholder="値を入力"
                {...register(`contact_methods.${index}.value`)}
              />
            </div>

            <div className={styles.contactDelete}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                aria-label="削除"
              >
                <X size={16} />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.selectorSection}>
        <Label>所属・関係</Label>
        {relationships.length > 0 ? (
          <>
            <Select
              resetOnSelect
              onValueChange={(val) => {
                if (!selectedRelIds.includes(val)) {
                  const newIds = [...selectedRelIds, val];
                  setSelectedRelIds(newIds);
                  setValue("relationship_ids", newIds.map(Number), {
                    shouldValidate: true,
                  });
                }
              }}
            >
              <SelectTrigger aria-label="所属">
                <SelectValue placeholder="所属を選択" />
              </SelectTrigger>
              <SelectContent>
                {flatRelationships.map((rel) => (
                  <SelectItem key={rel.id} value={rel.id}>
                    {rel.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRelIds.length > 0 && (
              <div className={styles.selectedItems}>
                {selectedRelIds.map((id) => {
                  const rel = flatRelationships.find((r) => r.id === id);
                  return (
                    <span key={id} className={styles.selectedChip}>
                      {rel?.label}
                      <button
                        type="button"
                        className={styles.chipRemove}
                        onClick={() => {
                          const newIds = selectedRelIds.filter(
                            (x) => x !== id,
                          );
                          setSelectedRelIds(newIds);
                          setValue(
                            "relationship_ids",
                            newIds.map(Number),
                          );
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <p className={styles.emptyHint}>
            所属・関係がありません。
            <a href="/relationships">所属・関係管理</a>
            で作成できます。
          </p>
        )}
      </div>

      <div className={styles.selectorSection}>
        <Label>タグ</Label>
        {tags.length > 0 ? (
          <>
            <Select
              resetOnSelect
              onValueChange={(val) => {
                if (!selectedTagIds.includes(val)) {
                  const newIds = [...selectedTagIds, val];
                  setSelectedTagIds(newIds);
                  setValue("tag_ids", newIds.map(Number), {
                    shouldValidate: true,
                  });
                }
              }}
            >
              <SelectTrigger aria-label="タグ">
                <SelectValue placeholder="タグを選択" />
              </SelectTrigger>
              <SelectContent>
                {tags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTagIds.length > 0 && (
              <div className={styles.selectedItems}>
                {selectedTagIds.map((id) => {
                  const tag = tags.find((t) => t.id === id);
                  return (
                    <span key={id} className={styles.selectedChip}>
                      {tag?.name}
                      <button
                        type="button"
                        className={styles.chipRemove}
                        onClick={() => {
                          const newIds = selectedTagIds.filter(
                            (x) => x !== id,
                          );
                          setSelectedTagIds(newIds);
                          setValue("tag_ids", newIds.map(Number));
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <p className={styles.emptyHint}>
            タグがありません。<a href="/tags">タグ管理</a>
            で作成できます。
          </p>
        )}
      </div>

      <div className={styles.formActions}>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
