import { apiClient } from "./client";

// ─── Types ───────────────────────────────────────────────

export interface ImportResult {
  relationships_created: number;
  tags_created: number;
  namecards_created: number;
  errors: string[];
}

export interface ImportData {
  version: string;
  relationships: unknown[];
  tags: unknown[];
  namecards: unknown[];
}

// ─── API Functions ───────────────────────────────────────

export async function importJSON(data: ImportData): Promise<ImportResult> {
  const response = await apiClient.post<ImportResult>("/import", data);
  return response.data;
}
