/**
 * API client for the Furniture AI backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function assetUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `API Error: ${response.status}`);
  }
  return response.json();
}

// ─── Furniture ──────────────────────────────────────────────────────

/** Get built-in GLB furniture catalog */
export async function getCatalog() {
  return apiFetch<{ items: any[]; total: number }>('/api/furniture/catalog');
}

/** Quick Preview Mode — single image upload */
export async function uploadFurniture(params: {
  name: string;
  category: string;
  width: number;
  height: number;
  depth: number;
  image: File;
}) {
  const formData = new FormData();
  formData.append('name', params.name);
  formData.append('category', params.category);
  formData.append('width', params.width.toString());
  formData.append('height', params.height.toString());
  formData.append('depth', params.depth.toString());
  formData.append('image', params.image);
  return apiFetch<any>('/api/furniture/upload', { method: 'POST', body: formData });
}

/** High Quality 3D Mode — multi-view upload with reconstruction */
export async function uploadMultiViewFurniture(params: {
  name: string;
  category: string;
  width: number;
  height: number;
  depth: number;
  images: File[];
  angles: string[];
}) {
  const formData = new FormData();
  formData.append('name', params.name);
  formData.append('category', params.category);
  formData.append('width', params.width.toString());
  formData.append('height', params.height.toString());
  formData.append('depth', params.depth.toString());
  formData.append('angles', params.angles.join(','));
  params.images.forEach((img) => {
    formData.append('images', img);
  });
  return apiFetch<any>('/api/furniture/upload-multiview', { method: 'POST', body: formData });
}

/** Poll reconstruction progress */
export async function getReconstructionStatus(itemId: string) {
  return apiFetch<{
    status: string;
    steps: { name: string; status: string }[];
    model_url: string;
    mesh_vertices?: number;
    mesh_faces?: number;
    file_size_bytes?: number;
    processing_time_seconds?: number;
    error?: string;
  }>(`/api/furniture/${itemId}/reconstruction-status`);
}

/** List user-uploaded furniture */
export async function listFurniture() {
  return apiFetch<{ items: any[]; total: number }>('/api/furniture');
}

/** Check AI 3D generation status */
export async function getGenerationStatus() {
  return apiFetch<{ available: boolean; provider: string; message: string }>('/api/furniture/generation-status');
}

export async function deleteFurniture(id: string) {
  return apiFetch<{ status: string; id: string }>(`/api/furniture/${id}`, { method: 'DELETE' });
}

/** Re-run background removal on all furniture items */
export async function reprocessAllFurniture() {
  return apiFetch<{ total: number; results: any[] }>('/api/furniture/reprocess-all', { method: 'POST' });
}

// ─── Room ───────────────────────────────────────────────────────────

export async function uploadRoom(image: File, widthCm?: number, lengthCm?: number) {
  const formData = new FormData();
  formData.append('image', image);
  if (widthCm) formData.append('width_cm', widthCm.toString());
  if (lengthCm) formData.append('length_cm', lengthCm.toString());
  return apiFetch<any>('/api/rooms/upload', { method: 'POST', body: formData });
}

export async function adjustRoom(roomId: string, adjustment: any) {
  return apiFetch<any>(`/api/rooms/${roomId}/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(adjustment),
  });
}

// ─── Enhancement ────────────────────────────────────────────────────

export async function getEnhancementStatus() {
  return apiFetch<{ available: boolean; ai_available: boolean; message: string }>('/api/enhance/status');
}

export async function enhanceScreenshot(imageBlob: Blob) {
  const formData = new FormData();
  formData.append('image', imageBlob, 'screenshot.png');
  return apiFetch<{
    id: string;
    status: string;
    enhanced_image: string;
    original_image: string;
    file_size: number;
    created_at: string;
  }>('/api/enhance', { method: 'POST', body: formData });
}

