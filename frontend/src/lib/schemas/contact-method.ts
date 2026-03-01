import { z } from "zod";

export const CONTACT_METHOD_TYPES = [
  "email",
  "tel",
  "mobile",
  "fax",
  "website",
  "x",
  "instagram",
  "youtube",
  "discord",
  "booth",
  "github",
  "linkedin",
  "facebook",
  "line",
  "tiktok",
  "address",
  "other",
] as const;

export const contactMethodSchema = z.object({
  type: z.enum(CONTACT_METHOD_TYPES),
  value: z.string().min(1, "値を入力してください"),
  is_primary: z.boolean().optional(),
});

export type ContactMethodFormData = z.infer<typeof contactMethodSchema>;
