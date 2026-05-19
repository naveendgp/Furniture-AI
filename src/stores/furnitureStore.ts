/**
 * Zustand store for furniture asset library.
 * Supports both Quick Preview (single image) and High Quality 3D (multi-view) modes.
 */
import { create } from 'zustand';
import { FurnitureAsset } from '@/types';
import * as api from '@/lib/api';

interface FurnitureStore {
  assets: FurnitureAsset[];
  catalogAssets: FurnitureAsset[];
  loading: boolean;
  uploading: boolean;
  generationAvailable: boolean;
  reconstructingIds: Set<string>;
  error: string | null;
  fetchAll: () => Promise<void>;
  uploadFurniture: (data: { name: string; category: string; width: number; height: number; depth: number; image: File }) => Promise<FurnitureAsset>;
  uploadMultiView: (data: { name: string; category: string; width: number; height: number; depth: number; images: File[]; angles: string[] }) => Promise<FurnitureAsset>;
  uploadVideo: (data: { name: string; category: string; width: number; height: number; depth: number; video: File }) => Promise<FurnitureAsset>;
  extractAngles: (data: { name: string; category: string; width: number; height: number; depth: number; video: File }) => Promise<any>;
  removeBackgrounds: (itemId: string) => Promise<any>;
  finalizeVideoUpload: (itemId: string) => Promise<void>;
  pollReconstruction: (id: string) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  clearError: () => void;
}

function mapApiToAsset(item: any): FurnitureAsset {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    width: item.width,
    height: item.height,
    depth: item.depth,
    originalImage: item.original_image || '',
    processedImage: item.processed_image || '',
    modelUrl: item.model_url || '',
    angleImages: item.angle_images || [],
    angleLabels: item.angle_labels || [],
    thumbnail: item.thumbnail || '',
    builtin: item.builtin || false,
    generationStatus: item.generation_status || '',
    uploadMode: item.upload_mode || 'quick',
    createdAt: item.created_at || '',
  };
}

export const useFurnitureStore = create<FurnitureStore>((set, get) => ({
  assets: [],
  catalogAssets: [],
  loading: false,
  uploading: false,
  generationAvailable: false,
  reconstructingIds: new Set(),
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null });
    try {
      const [catalogResp, uploadedResp, genResp] = await Promise.all([
        api.getCatalog(),
        api.listFurniture(),
        api.getGenerationStatus(),
      ]);
      const catalogItems = catalogResp.items.map(mapApiToAsset);
      const uploadedItems = uploadedResp.items.map(mapApiToAsset);
      set({
        catalogAssets: catalogItems,
        assets: [...catalogItems, ...uploadedItems],
        generationAvailable: genResp.available,
        loading: false,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch', loading: false });
    }
  },

  uploadFurniture: async (data) => {
    set({ uploading: true, error: null });
    try {
      const response = await api.uploadFurniture(data);
      const asset = mapApiToAsset(response);
      set((s) => ({ assets: [...s.assets, asset], uploading: false }));
      return asset;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Upload failed', uploading: false });
      throw err;
    }
  },

  uploadMultiView: async (data) => {
    set({ uploading: true, error: null });
    try {
      const response = await api.uploadMultiViewFurniture(data);
      const asset = mapApiToAsset(response);
      set((s) => ({ assets: [...s.assets, asset], uploading: false }));
      return asset;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Upload failed', uploading: false });
      throw err;
    }
  },

  extractAngles: async (data) => {
    set({ uploading: true, error: null });
    try {
      const response = await api.extractAngles(data);
      set({ uploading: false });
      return response; // Raw response with raw angle images
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Extraction failed', uploading: false });
      throw err;
    }
  },

  removeBackgrounds: async (itemId: string) => {
    set({ uploading: true, error: null });
    try {
      const response = await api.removeBackgrounds(itemId);
      set({ uploading: false });
      return response; // Processed angle images
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'BG removal failed', uploading: false });
      throw err;
    }
  },

  finalizeVideoUpload: async (itemId: string) => {
    try {
      const resp = await api.listFurniture();
      const item = resp.items.find((i: any) => i.id === itemId);
      if (item) {
        const asset = mapApiToAsset(item);
        set((s) => {
          const exists = s.assets.some((a) => a.id === itemId);
          if (exists) return {};
          return { assets: [...s.assets, asset] };
        });
      }
    } catch { /* ignore */ }
  },

  uploadVideo: async (data) => {
    set({ uploading: true, error: null });
    try {
      const response = await api.uploadFurnitureVideo(data);
      const asset = mapApiToAsset(response);
      set((s) => ({ assets: [...s.assets, asset], uploading: false }));
      return asset;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Upload failed', uploading: false });
      throw err;
    }
  },

  pollReconstruction: async (id: string) => {
    const poll = async () => {
      try {
        const status = await api.getReconstructionStatus(id);
        
        if (status.status === 'completed' || status.status === 'failed') {
          // Update the asset in the list
          set((s) => {
            const newReconstructing = new Set(s.reconstructingIds);
            newReconstructing.delete(id);
            const updatedAssets = s.assets.map((a) =>
              a.id === id
                ? {
                    ...a,
                    modelUrl: status.model_url || a.modelUrl,
                    generationStatus: status.status,
                  }
                : a
            );
            return { assets: updatedAssets, reconstructingIds: newReconstructing };
          });
          return; // Stop polling
        }

        // Keep polling every 3 seconds
        setTimeout(poll, 3000);
      } catch {
        // Stop polling on error
        set((s) => {
          const newReconstructing = new Set(s.reconstructingIds);
          newReconstructing.delete(id);
          return { reconstructingIds: newReconstructing };
        });
      }
    };

    poll();
  },

  deleteAsset: async (id) => {
    try {
      await api.deleteFurniture(id);
      set((s) => ({
        assets: s.assets.filter((a) => a.id !== id),
        reconstructingIds: (() => { const n = new Set(s.reconstructingIds); n.delete(id); return n; })(),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Delete failed' });
    }
  },

  clearError: () => set({ error: null }),
}));
