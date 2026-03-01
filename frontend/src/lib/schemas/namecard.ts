import { z } from "zod";
import { contactMethodSchema } from "./contact-method";

export const namecardCreateSchema = z.object({
  first_name: z.string().min(1, "名は必須です"),
  last_name: z.string().min(1, "姓は必須です"),
  first_name_kana: z.string().optional(),
  last_name_kana: z.string().optional(),
  company_name: z.string().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
  memo: z.string().optional(),
  contact_methods: z.array(contactMethodSchema).optional(),
  relationship_ids: z.array(z.number()).optional(),
  tag_ids: z.array(z.number()).optional(),
});

export const namecardUpdateSchema = namecardCreateSchema.partial();

export type NamecardCreateFormData = z.infer<typeof namecardCreateSchema>;
export type NamecardUpdateFormData = z.infer<typeof namecardUpdateSchema>;
