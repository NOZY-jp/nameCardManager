import { apiClient } from "./client";

export interface CornerPoint {
  x: number;
  y: number;
}

export interface UploadImageResponse {
  upload_id: string;
}

export interface ProcessImageRequest {
  upload_id: string;
  corners: CornerPoint[];
}

export interface ProcessImageResponse {
  ocr_result: {
    first_name?: string;
    last_name?: string;
    first_name_kana?: string;
    last_name_kana?: string;
    company_name?: string;
    department?: string;
    position?: string;
    memo?: string;
    contact_methods?: Array<{ type: string; value: string; label?: string }>;
  };
  image_path: string;
  thumbnail_path: string;
}

export const imageApi = {
  async upload(file: File): Promise<UploadImageResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await apiClient.post<UploadImageResponse>(
      "/images/upload",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return response.data;
  },

  async process(params: ProcessImageRequest): Promise<ProcessImageResponse> {
    const response = await apiClient.post<ProcessImageResponse>(
      "/images/process",
      { upload_id: params.upload_id, corners: params.corners },
    );
    return response.data;
  },
};
