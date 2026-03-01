import { z } from "zod";

export const searchQuerySchema = z.object({
  q: z.string(),
  page: z.number().int().positive().optional(),
  per_page: z.number().int().positive().optional(),
  tag_ids: z.string().optional(),
  relationship_ids: z.string().optional(),
});

export type SearchQueryData = z.infer<typeof searchQuerySchema>;
