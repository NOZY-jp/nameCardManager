import { apiClient } from "./client";

// ─── Types ───────────────────────────────────────────────

export interface ExportData {
  version: string;
  relationships: unknown[];
  tags: unknown[];
  namecards: unknown[];
}

// ─── API Functions ───────────────────────────────────────

export async function exportJSON(): Promise<ExportData> {
  const response = await apiClient.get<ExportData>("/export");
  return response.data;
}
