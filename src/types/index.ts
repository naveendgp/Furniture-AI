/**
 * Core TypeScript types for the Furniture AI application.
 */

// ─── Furniture Assets ───────────────────────────────────────────────

export interface FurnitureAsset {
  id: string;
  name: string;
  category: string;
  width: number;
  height: number;
  depth: number;
  /** Processed 2D image (bg removed) — fallback when no 3D model */
  processedImage: string;
  originalImage: string;
  /** URL to the GLB 3D model (either built-in CDN or locally generated) */
  modelUrl: string;
  /** Multi-view angle images (URLs) for 2.5D sprite rotation */
  angleImages: string[];
  /** Angle labels corresponding to angleImages: 'front', 'left', 'right', 'back', etc. */
  angleLabels: string[];
  /** Emoji thumbnail for catalog items */
  thumbnail: string;
  /** Whether this is a built-in catalog item or user-uploaded */
  builtin: boolean;
  /** 3D generation status: unavailable | processing | completed | failed */
  generationStatus?: string;
  /** Upload mode: quick | multiview */
  uploadMode?: string;
  createdAt?: string;
}

// ─── Scene Objects ──────────────────────────────────────────────────

export interface SceneFurniture {
  instanceId: string;
  assetId: string;
  asset: FurnitureAsset;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

// ─── Room Data ──────────────────────────────────────────────────────

export interface SuggestedPlacement {
  position: [number, number, number];
  label: string;
}

export interface RoomData {
  id: string;
  imagePath: string;
  depthMapPath: string;
  floorMaskPath: string;
  floorPolygon: [number, number][];
  roomWidthCm: number;
  roomDepthCm: number;
  floorY: number;
  perspectiveFov: number;
  vanishingPoint: [number, number];
  cameraPosition: [number, number, number];
  cameraRotation: [number, number, number];
  suggestedPlacements: SuggestedPlacement[];
  confidence: number;
}

// ─── UI State ───────────────────────────────────────────────────────

export type TransformMode = 'translate' | 'rotate' | 'scale';

export type FurnitureCategory =
  | 'all'
  | 'sofa'
  | 'chair'
  | 'table'
  | 'bed'
  | 'shelf'
  | 'lamp'
  | 'decor'
  | 'other';

export const FURNITURE_CATEGORIES: FurnitureCategory[] = [
  'all', 'sofa', 'chair', 'table', 'bed', 'shelf', 'lamp', 'decor', 'other',
];
