import { apiClient } from "./client";

// ─── Types ───────────────────────────────────────────────

export interface RelationshipNode {
  id: string;
  node_name: string;
  parent_id: string | null;
  children: RelationshipNode[];
}

export interface RelationshipCreateData {
  name: string;
  parent_id: string | null;
}

export interface RelationshipUpdateData {
  name: string;
}

// ─── API Functions ───────────────────────────────────────

export async function getRelationships(): Promise<RelationshipNode[]> {
  const response = await apiClient.get<RelationshipNode[]>("/relationships");
  return response.data;
}

export async function createRelationship(
  data: RelationshipCreateData,
): Promise<RelationshipNode> {
  const response = await apiClient.post<RelationshipNode>(
    "/relationships",
    data,
  );
  return response.data;
}

export async function updateRelationship(
  id: string,
  data: RelationshipUpdateData,
): Promise<RelationshipNode> {
  const response = await apiClient.patch<RelationshipNode>(
    `/relationships/${id}`,
    data,
  );
  return response.data;
}

export async function deleteRelationship(id: string): Promise<void> {
  await apiClient.delete(`/relationships/${id}`);
}
