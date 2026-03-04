import { apiClient } from "./client";

// ─── Types ───────────────────────────────────────────────

export interface ContactMethod {
  id?: string;
  type: string;
  value: string;
  is_primary?: boolean;
  label?: string;
}

export interface RelationshipRef {
  id: string;
  name?: string;
  full_path?: string;
  parent_id?: string | null;
}

export interface TagRef {
  id: string;
  name: string;
}

export interface NameCard {
  id: string;
  user_id: string;
  last_name: string;
  first_name: string;
  last_name_kana?: string;
  first_name_kana?: string;
  company_name?: string;
  department?: string;
  position?: string;
  image_front_url?: string | null;
  image_back_url?: string | null;
  image_path?: string | null;
  thumbnail_path?: string | null;
  memo?: string;
  met_notes?: string;
  contact_methods: ContactMethod[];
  relationships: RelationshipRef[];
  tags: TagRef[];
  created_at: string;
  updated_at: string;
}

export interface NameCardCreateData {
  first_name: string;
  last_name: string;
  first_name_kana?: string;
  last_name_kana?: string;
  company_name?: string;
  department?: string;
  position?: string;
  memo?: string;
  met_notes?: string;
  image_path?: string;
  contact_methods?: Omit<ContactMethod, "id">[];
  relationship_ids?: number[];
  tag_ids?: number[];
}

export interface NameCardUpdateData extends Partial<NameCardCreateData> {}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface GetNameCardsParams {
  page?: number;
  per_page?: number;
  sort_by?: "created_at" | "updated_at" | "first_name" | "last_name";
  sort_order?: "asc" | "desc";
  search?: string;
}

// ─── API Functions ───────────────────────────────────────

export async function getNameCards(
  params: GetNameCardsParams = {},
): Promise<PaginatedResponse<NameCard>> {
  const { sort_order, ...rest } = params;
  const apiParams: Record<string, unknown> = { ...rest };
  if (sort_order) {
    apiParams.order = sort_order;
  }
  const response = await apiClient.get<PaginatedResponse<NameCard>>(
    "/namecards",
    { params: apiParams },
  );
  return response.data;
}

export async function getNameCard(id: string): Promise<NameCard> {
  const response = await apiClient.get<NameCard>(`/namecards/${id}`);
  return response.data;
}

export async function createNameCard(
  data: NameCardCreateData,
): Promise<NameCard> {
  const response = await apiClient.post<NameCard>("/namecards", data);
  return response.data;
}

export async function updateNameCard(
  id: string | number,
  data: NameCardUpdateData,
): Promise<NameCard> {
  const response = await apiClient.patch<NameCard>(`/namecards/${id}`, data);
  return response.data;
}

export async function deleteNameCard(id: string | number): Promise<void> {
  await apiClient.delete(`/namecards/${id}`);
}

// ─── Convenience Object (used by tests) ─────────────────

interface ListParams {
  page?: number;
  perPage?: number;
  sort_by?: GetNameCardsParams["sort_by"];
  sort_order?: GetNameCardsParams["sort_order"];
  search?: string;
}

export const namecardApi = {
  list: async (params: ListParams = {}) => {
    const { perPage, ...rest } = params;
    return getNameCards({ ...rest, per_page: perPage });
  },
  get: getNameCard,
  create: async (data: Record<string, unknown>) =>
    createNameCard(data as unknown as NameCardCreateData),
  update: async (id: number | string, data: Record<string, unknown>) =>
    updateNameCard(id, data as unknown as NameCardUpdateData),
  delete: async (id: number | string) => deleteNameCard(id),
};
