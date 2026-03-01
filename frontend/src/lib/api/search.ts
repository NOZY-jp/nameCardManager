import { apiClient } from "./client";
import type { NameCard, PaginatedResponse } from "./namecards";

// ─── Types ───────────────────────────────────────────────

export interface SearchParams {
  q: string;
  page?: number;
  per_page?: number;
  tag_ids?: string;
  relationship_ids?: string;
}

// ─── API Functions ───────────────────────────────────────

export async function searchNameCards(
  params: SearchParams,
): Promise<PaginatedResponse<NameCard>> {
  const response = await apiClient.get<PaginatedResponse<NameCard>>("/search", {
    params,
  });
  return response.data;
}

export const searchApi = {
  search: searchNameCards,
};
