import { apiClient } from "./client";

// ─── Types ───────────────────────────────────────────────

export interface Tag {
  id: string;
  name: string;
}

export interface TagCreateData {
  name: string;
}

export interface TagUpdateData {
  name: string;
}

// ─── API Functions ───────────────────────────────────────

export async function getTags(): Promise<Tag[]> {
  const response = await apiClient.get<Tag[]>("/tags");
  return response.data;
}

export async function createTag(data: TagCreateData): Promise<Tag> {
  const response = await apiClient.post<Tag>("/tags", data);
  return response.data;
}

export async function updateTag(id: string, data: TagUpdateData): Promise<Tag> {
  const response = await apiClient.patch<Tag>(`/tags/${id}`, data);
  return response.data;
}

export async function deleteTag(id: string): Promise<void> {
  await apiClient.delete(`/tags/${id}`);
}
