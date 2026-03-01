import { z } from "zod";

export const importSchema = z.object({
  version: z.string().min(1),
  relationships: z.array(
    z.object({
      name: z.string(),
      parent_id: z.number().nullable().optional(),
    }),
  ),
  tags: z.array(
    z.object({
      name: z.string(),
    }),
  ),
  namecards: z.array(
    z
      .object({
        first_name: z.string(),
        last_name: z.string(),
      })
      .passthrough(),
  ),
});

export type ImportData = z.infer<typeof importSchema>;
