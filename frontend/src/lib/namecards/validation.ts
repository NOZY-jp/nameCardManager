/** 名刺 API の入力検証（FastAPI の Pydantic スキーマに対応）。 */
import { z } from "zod";

export const CONTACT_TYPES = [
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

const contactSchema = z.object({
  type: z.enum(CONTACT_TYPES),
  value: z.string(),
  is_primary: z.boolean().optional().default(false),
});

const nullableText = z.string().nullable().optional();

export const nameCardCreateSchema = z.object({
  first_name: z.string().optional().default(""),
  last_name: z.string(),
  first_name_kana: nullableText,
  last_name_kana: nullableText,
  company_name: nullableText,
  department: nullableText,
  position: nullableText,
  image_paths: z.array(z.string()).nullable().optional(),
  met_notes: nullableText,
  memo: nullableText,
  contact_methods: z.array(contactSchema).optional().default([]),
  relationship_ids: z.array(z.number().int()).optional().default([]),
  tag_ids: z.array(z.number().int()).optional().default([]),
});

export const nameCardUpdateSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  first_name_kana: nullableText,
  last_name_kana: nullableText,
  company_name: nullableText,
  department: nullableText,
  position: nullableText,
  met_notes: nullableText,
  memo: nullableText,
  contact_methods: z.array(contactSchema).optional(),
  relationship_ids: z.array(z.number().int()).optional(),
  tag_ids: z.array(z.number().int()).optional(),
});

export function toCreateInput(body: z.infer<typeof nameCardCreateSchema>) {
  return {
    first_name: body.first_name,
    last_name: body.last_name,
    first_name_kana: body.first_name_kana ?? null,
    last_name_kana: body.last_name_kana ?? null,
    company_name: body.company_name ?? null,
    department: body.department ?? null,
    position: body.position ?? null,
    image_paths: body.image_paths ?? [],
    met_notes: body.met_notes ?? null,
    memo: body.memo ?? null,
    contact_methods: body.contact_methods,
    relationship_ids: body.relationship_ids,
    tag_ids: body.tag_ids,
  };
}

export function toPatchInput(body: z.infer<typeof nameCardUpdateSchema>) {
  const patch: Record<string, unknown> = {};
  for (const key of [
    "first_name",
    "last_name",
    "first_name_kana",
    "last_name_kana",
    "company_name",
    "department",
    "position",
    "met_notes",
    "memo",
  ] as const) {
    if (Object.hasOwn(body, key)) {
      patch[key] = body[key] ?? null;
    }
  }
  if (body.contact_methods !== undefined)
    patch.contact_methods = body.contact_methods;
  if (body.relationship_ids !== undefined)
    patch.relationship_ids = body.relationship_ids;
  if (body.tag_ids !== undefined) patch.tag_ids = body.tag_ids;
  return patch;
}

export function parseCommaIds(raw: string | null): number[] | null {
  if (raw === null || raw.trim() === "") return [];
  const ids: number[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (!/^\d+$/.test(trimmed)) return null;
    ids.push(Number(trimmed));
  }
  return ids;
}

export function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
