/**
 * Application constants and configuration.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// 3D Scene defaults
export const DEFAULT_FLOOR_Y = -1.5;
export const DEFAULT_FOV = 60;
export const DEFAULT_CAMERA_POSITION: [number, number, number] = [0, 2, 5];
export const DEFAULT_CAMERA_TARGET: [number, number, number] = [0, 0, 0];

// Furniture defaults
export const DEFAULT_FURNITURE_SCALE: [number, number, number] = [1, 1, 1];
export const DEFAULT_FURNITURE_ROTATION: [number, number, number] = [0, 0, 0];

// Billboard scale factor (converts cm to 3D units)
export const CM_TO_3D_SCALE = 0.01;

// UI
export const PANEL_WIDTH = 280;
export const TOP_BAR_HEIGHT = 56;
