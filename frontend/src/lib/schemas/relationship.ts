import { z } from "zod";

export const relationshipCreateSchema = z.object({
  name: z.string().min(1, "名前を入力してください"),
  parent_id: z.number().nullable().optional(),
});

export type RelationshipCreateFormData = z.infer<
  typeof relationshipCreateSchema
>;
