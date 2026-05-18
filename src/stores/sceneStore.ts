/**
 * Zustand store for placed furniture instances in the 3D scene.
 * Features:
 *   - Floor polygon constraint (furniture stays on floor)
 *   - Smart AI placement (category-aware positioning + room-relative scaling)
 */
import { create } from 'zustand';
import { SceneFurniture, FurnitureAsset, TransformMode, SuggestedPlacement } from '@/types';

interface SceneStore {
  items: SceneFurniture[];
  selectedId: string | null;
  transformMode: TransformMode;
  floorBounds: [number, number][];
  floorY: number;
  roomWidthCm: number;
  roomDepthCm: number;
  worldScale: number; // 3D world units per 1 cm — derived from room dims
  suggestedPlacements: SuggestedPlacement[];

  addItem: (asset: FurnitureAsset, position?: [number, number, number]) => string;
  /** Smart add — AI picks best position & scale */
  smartAddItem: (asset: FurnitureAsset) => string;
  removeItem: (instanceId: string) => void;
  updateItem: (instanceId: string, updates: Partial<SceneFurniture>) => void;
  duplicateItem: (instanceId: string) => string | null;
  selectItem: (instanceId: string | null) => void;
  setTransformMode: (mode: TransformMode) => void;
  setFloorBounds: (polygon: [number, number][]) => void;
  setRoomData: (data: { floorY: number; roomWidthCm: number; roomDepthCm: number; suggestedPlacements: SuggestedPlacement[] }) => void;
  setWorldScale: (scale: number) => void;
  isPositionOnFloor: (x: number, z: number) => boolean;
  clampToFloor: (x: number, z: number) => [number, number];
  clearScene: () => void;
  exportScene: () => string;
  getTotalArea: () => number;
  getOccupiedArea: () => number;
  getFreeSpacePercentage: () => number;
}

let nextId = 1;
function genId(): string {
  return `item_${nextId++}_${Date.now()}`;
}

function pointInPolygon(px: number, py: number, polygon: [number, number][]): boolean {
  if (polygon.length < 3) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function nearestPointOnPolygon(px: number, py: number, polygon: [number, number][]): [number, number] {
  if (polygon.length < 2) return [px, py];
  let minDist = Infinity;
  let nearest: [number, number] = [px, py];
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[j];
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
    if (dist < minDist) { minDist = dist; nearest = [cx, cy]; }
  }
  return nearest;
}

/** Get the center of the floor polygon */
function getFloorCenter(polygon: [number, number][]): [number, number] {
  if (polygon.length === 0) return [0, 0];
  const cx = polygon.reduce((s, p) => s + p[0], 0) / polygon.length;
  const cy = polygon.reduce((s, p) => s + p[1], 0) / polygon.length;
  return [cx, cy];
}

/** Get smart placement position based on furniture category */
function getSmartPosition(
  category: string,
  floorBounds: [number, number][],
  existingItems: SceneFurniture[],
  suggestedPlacements: SuggestedPlacement[],
  assetWidth: number,
  assetDepth: number,
  worldScale: number,
): [number, number] {
  // Preference map: where each category should go
  const categoryPreference: Record<string, string> = {
    'sofa': 'back wall',
    'chair': 'right side',
    'table': 'center',
    'bed': 'back wall',
    'shelf': 'left side',
    'lamp': 'right side',
    'decor': 'front area',
    'other': 'center',
  };

  const preferred = categoryPreference[category] || 'center';

  // Collision radius based on furniture size (in 3D units)
  const collisionRadius = Math.max(assetWidth, assetDepth) * worldScale * 0.6;

  // Helper: inset position away from floor polygon edges
  // This prevents furniture from overlapping with walls
  const insetFromWalls = (x: number, z: number, insetAmount: number = 0.3): [number, number] => {
    if (floorBounds.length < 3) return [x, z];
    if (!pointInPolygon(x, z, floorBounds)) {
      return nearestPointOnPolygon(x, z, floorBounds);
    }
    // Move point toward floor center to create wall inset
    const center = getFloorCenter(floorBounds);
    const dx = center[0] - x;
    const dz = center[1] - z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.01) return [x, z]; // Already at center
    
    // Check if we're close to any edge — if so, move inward
    const nearest = nearestPointOnPolygon(x, z, floorBounds);
    const edgeDist = Math.sqrt((x - nearest[0]) ** 2 + (z - nearest[1]) ** 2);
    if (edgeDist < insetAmount) {
      const factor = insetAmount / dist;
      const newX = x + dx * factor;
      const newZ = z + dz * factor;
      if (pointInPolygon(newX, newZ, floorBounds)) return [newX, newZ];
    }
    return [x, z];
  };

  // Check if position conflicts with existing items
  const hasCollision = (pos: [number, number]): boolean => {
    return existingItems.some((item) => {
      const dx = item.position[0] - pos[0];
      const dz = item.position[2] - pos[1];
      return Math.sqrt(dx * dx + dz * dz) < collisionRadius;
    });
  };

  // Try to use AI-suggested placement matching the preference
  const matchingSuggestion = suggestedPlacements.find(
    (sp) => sp.label === preferred
  );

  if (matchingSuggestion) {
    const pos = insetFromWalls(matchingSuggestion.position[0], matchingSuggestion.position[2]);
    if (!hasCollision(pos)) return pos;
  }

  // Fallback: find any suggested placement that isn't occupied
  for (const sp of suggestedPlacements) {
    const pos = insetFromWalls(sp.position[0], sp.position[2]);
    if (!hasCollision(pos)) return pos;
  }

  // Final fallback: floor center with spiral offset to avoid stacking
  const center = getFloorCenter(floorBounds);
  const angle = existingItems.length * (Math.PI / 3); // 60° increments
  const radius = 0.4 + existingItems.length * 0.25;
  const offsetX = center[0] + Math.cos(angle) * radius;
  const offsetZ = center[1] + Math.sin(angle) * radius;
  
  // Clamp to floor
  if (floorBounds.length >= 3 && !pointInPolygon(offsetX, offsetZ, floorBounds)) {
    return nearestPointOnPolygon(offsetX, offsetZ, floorBounds);
  }
  return [offsetX, offsetZ];
}


export const useSceneStore = create<SceneStore>((set, get) => ({
  items: [],
  selectedId: null,
  transformMode: 'translate',
  floorBounds: [],
  floorY: -1.5,
  roomWidthCm: 0,
  roomDepthCm: 0,
  worldScale: 0.01, // default: 1cm = 0.01 world units (600cm world = 6 units)
  suggestedPlacements: [],

  addItem: (asset, position) => {
    const id = genId();
    const state = get();
    // GLB models have origin at bottom, so Y = floorY
    const pos: [number, number, number] = position || [0, state.floorY, 0];

    const item: SceneFurniture = {
      instanceId: id,
      assetId: asset.id,
      asset,
      position: pos,
      rotation: [0, 0, 0],
      scale: [1.2, 1.2, 1.2],
    };
    set((s) => ({ items: [...s.items, item], selectedId: id }));
    return id;
  },

  smartAddItem: (asset) => {
    const state = get();
    const id = genId();

    // Smart position — always clamped to floor with wall inset
    let [wx, wz] = getSmartPosition(
      asset.category,
      state.floorBounds,
      state.items,
      state.suggestedPlacements,
      asset.width,
      asset.depth,
      state.worldScale,
    );

    // Double-check: ensure position is on floor
    if (state.floorBounds.length >= 3 && !pointInPolygon(wx, wz, state.floorBounds)) {
      [wx, wz] = nearestPointOnPolygon(wx, wz, state.floorBounds);
    }

    // GLB models have origin at bottom
    const pos: [number, number, number] = [wx, state.floorY, wz];

    const item: SceneFurniture = {
      instanceId: id,
      assetId: asset.id,
      asset,
      position: pos,
      rotation: [0, 0, 0],
      scale: [1.2, 1.2, 1.2], // Make it slightly larger initially
    };

    set((s) => ({ items: [...s.items, item], selectedId: id }));
    return id;
  },

  removeItem: (instanceId) => {
    set((s) => ({
      items: s.items.filter((i) => i.instanceId !== instanceId),
      selectedId: s.selectedId === instanceId ? null : s.selectedId,
    }));
  },

  updateItem: (instanceId, updates) => {
    const state = get();
    // Always enforce floor bounds for position updates
    if (updates.position) {
      const [x, y, z] = updates.position;
      let finalX = x, finalZ = z;

      // Let the user freely move the furniture anywhere on the floor plane.
      // (Removed AI floor polygon clamping because it artificially restricted movement into empty spaces).


      // Overlap Collision Prevention
      const movingItem = state.items.find(i => i.instanceId === instanceId);
      if (movingItem) {
        let collided = false;
        // Calculate physical radius footprint in world space using calibrated worldScale
        const moveRadius = Math.max(movingItem.asset.width, movingItem.asset.depth) * state.worldScale * movingItem.scale[0] * 0.45;
         
        for (const other of state.items) {
          if (other.instanceId === instanceId) continue;
          const otherRadius = Math.max(other.asset.width, other.asset.depth) * state.worldScale * other.scale[0] * 0.45;
          const minDistance = moveRadius + otherRadius;
           
          const dx = other.position[0] - finalX;
          const dz = other.position[2] - finalZ;
          const dist = Math.sqrt(dx * dx + dz * dz);
           
          if (dist < minDistance) {
            collided = true;
            break;
          }
        }
         
        if (collided) {
          // Reject position update to prevent overlap
          delete updates.position;
        } else {
          updates.position = [finalX, y, finalZ];
        }
      } else {
        updates.position = [finalX, y, finalZ];
      }
    }
    set((s) => ({
      items: s.items.map((item) =>
        item.instanceId === instanceId ? { ...item, ...updates } : item
      ),
    }));
  },

  duplicateItem: (instanceId) => {
    const original = get().items.find((i) => i.instanceId === instanceId);
    if (!original) return null;
    const newId = genId();
    const dup: SceneFurniture = {
      ...original,
      instanceId: newId,
      position: [original.position[0] + 0.3, original.position[1], original.position[2] + 0.3],
    };
    set((s) => ({ items: [...s.items, dup], selectedId: newId }));
    return newId;
  },

  selectItem: (id) => set({ selectedId: id }),
  setTransformMode: (mode) => set({ transformMode: mode }),

  setFloorBounds: (polygon) => {
    const worldPoly: [number, number][] = polygon.map(([x, y]) => [
      (x - 0.5) * 6.0,
      -(y - 0.5) * 6.0,
    ]);
    // Recompute worldScale based on actual polygon X span if roomWidthCm is known
    const { roomWidthCm } = get();
    const xs = worldPoly.map(p => p[0]);
    const polySpanX = xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 6.0;
    const newScale = roomWidthCm > 0 ? polySpanX / roomWidthCm : get().worldScale;
    set({ floorBounds: worldPoly, worldScale: newScale });
  },

  setRoomData: (data) => {
    // Compute worldScale from actual floor polygon X-span (set by setFloorBounds first).
    // polySpanX = actual width of the room floor in 3D world units.
    // worldScale = polySpanX / roomWidthCm => furniture cm converts to correct world units.
    const { floorBounds } = get();
    let worldScale = get().worldScale; // keep existing until we can compute
    if (data.roomWidthCm > 0) {
      if (floorBounds.length >= 3) {
        const xs = floorBounds.map(p => p[0]);
        const polySpanX = Math.max(...xs) - Math.min(...xs);
        worldScale = polySpanX / data.roomWidthCm;
      } else {
        // fallback: assume floor spans the full 6-unit default
        worldScale = 6.0 / data.roomWidthCm;
      }
    }
    set({
      floorY: data.floorY,
      roomWidthCm: data.roomWidthCm,
      roomDepthCm: data.roomDepthCm,
      worldScale,
      suggestedPlacements: data.suggestedPlacements,
    });
  },

  /** Override worldScale directly — used by CalibrationSync with actual camera geometry */
  setWorldScale: (scale) => set({ worldScale: scale }),

  isPositionOnFloor: (x, z) => {
    const { floorBounds } = get();
    if (floorBounds.length < 3) return true;
    return pointInPolygon(x, z, floorBounds);
  },

  clampToFloor: (x, z) => {
    const { floorBounds } = get();
    if (floorBounds.length < 3) return [x, z];
    if (pointInPolygon(x, z, floorBounds)) return [x, z];
    return nearestPointOnPolygon(x, z, floorBounds);
  },

  clearScene: () => set({ items: [], selectedId: null }),

  exportScene: () => {
    const state = get();
    return JSON.stringify(state.items.map((i) => ({
      assetId: i.assetId,
      name: i.asset.name,
      position: i.position,
      rotation: i.rotation,
      scale: i.scale,
    })), null, 2);
  },

  getTotalArea: () => {
    const { roomWidthCm, roomDepthCm } = get();
    return (roomWidthCm / 100) * (roomDepthCm / 100); // Area in sq meters
  },

  getOccupiedArea: () => {
    const { items } = get();
    let area = 0;
    items.forEach(item => {
      const w = (item.asset.width / 100) * item.scale[0];
      const d = (item.asset.depth / 100) * item.scale[0];
      area += w * d;
    });
    return area;
  },

  getFreeSpacePercentage: () => {
    const total = get().getTotalArea();
    if (total === 0) return 100;
    const occupied = get().getOccupiedArea();
    const free = Math.max(0, total - occupied);
    return Math.round((free / total) * 100);
  },
}));
