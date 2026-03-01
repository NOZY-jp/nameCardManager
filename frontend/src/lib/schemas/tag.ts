import { z } from "zod";

export const tagCreateSchema = z.object({
  name: z.string().min(1, "タグ名を入力してください"),
});

export type TagCreateFormData = z.infer<typeof tagCreateSchema>;
