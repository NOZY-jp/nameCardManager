import { apiClient } from "./client";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
}

export interface UserResponse {
  id: number;
  email: string;
  created_at: string;
}

export async function loginApi(data: LoginRequest): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>("/auth/login", data);
  return response.data;
}

export async function registerApi(
  data: RegisterRequest,
): Promise<UserResponse> {
  const response = await apiClient.post<UserResponse>("/auth/register", data);
  return response.data;
}
