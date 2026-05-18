/**
 * Zustand store for room image and analysis state.
 */
import { create } from 'zustand';
import { RoomData, SuggestedPlacement } from '@/types';
import * as api from '@/lib/api';

interface RoomStore {
  room: RoomData | null;
  loading: boolean;
  error: string | null;
  uploadRoom: (image: File, widthCm?: number, lengthCm?: number) => Promise<void>;
  adjustFloor: (adj: { floorY?: number; perspectiveFov?: number }) => Promise<void>;
  clearRoom: () => void;
  clearError: () => void;
}

function mapApiToRoom(r: any): RoomData {
  return {
    id: r.id,
    imagePath: r.image_path,
    depthMapPath: r.depth_map_path,
    floorMaskPath: r.floor_mask_path || '',
    floorPolygon: r.floor_polygon || [],
    roomWidthCm: r.room_width_cm || 0,
    roomDepthCm: r.room_depth_cm || 0,
    floorY: r.floor_y,
    perspectiveFov: r.perspective_fov,
    vanishingPoint: r.vanishing_point,
    cameraPosition: r.camera_position || [0, 1.5, 4],
    cameraRotation: r.camera_rotation || [-0.2, 0, 0],
    suggestedPlacements: (r.suggested_placements || []).map((sp: any) => ({
      position: sp.position,
      label: sp.label,
    })),
    confidence: r.confidence,
  };
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  room: null,
  loading: false,
  error: null,

  uploadRoom: async (image, widthCm, lengthCm) => {
    set({ loading: true, error: null });
    try {
      const response = await api.uploadRoom(image, widthCm, lengthCm);
      set({ room: mapApiToRoom(response), loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Upload failed', loading: false });
    }
  },

  adjustFloor: async (adj) => {
    const state = get();
    if (!state.room) return;
    try {
      const response = await api.adjustRoom(state.room.id, {
        floor_y: adj.floorY,
        perspective_fov: adj.perspectiveFov,
      });
      set({ room: mapApiToRoom(response) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Adjust failed' });
    }
  },

  clearRoom: () => set({ room: null, error: null }),
  clearError: () => set({ error: null }),
}));
