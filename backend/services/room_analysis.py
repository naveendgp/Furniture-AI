"""Room analysis service — floor detection, room dimensions, perspective, AI placement."""

import logging
import math
from pathlib import Path
from typing import Dict, Any, Tuple, List, Optional

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


def analyze_room(
    image_path: Path,
    depth_map_path: Path,
    floor_mask_output: Path,
) -> Dict[str, Any]:
    """
    Full room analysis pipeline.

    1. Detect floor region from depth map → binary mask + polygon
    2. Estimate room dimensions from floor area + depth
    3. Estimate vanishing point + camera parameters
    4. Generate AI suggested placement positions on the floor
    """
    try:
        img = cv2.imread(str(image_path))
        depth = cv2.imread(str(depth_map_path), cv2.IMREAD_GRAYSCALE)

        if img is None or depth is None:
            logger.error("Failed to load images for room analysis")
            return _default_analysis()

        h, w = img.shape[:2]

        # 1. Floor mask + polygon
        floor_mask, floor_polygon, floor_conf = _detect_floor_mask(depth, img, h, w)

        # Save floor mask
        cv2.imwrite(str(floor_mask_output), floor_mask)

        # 2. Room dimensions
        room_width, room_depth = _estimate_room_dimensions(depth, floor_mask, h, w)

        # 3. Vanishing point + camera
        vp, vp_conf = _estimate_vanishing_point(img, h, w)
        fov = _estimate_fov(vp, h, w)
        cam_pos, cam_rot = _compute_camera(vp, fov, h, w)

        # 4. Suggested placements
        placements = _generate_placements(floor_polygon, floor_mask, h, w)

        confidence = (floor_conf + vp_conf) / 2.0

        # Normalize polygon to 0-1 range
        norm_polygon = [(float(x) / w, float(y) / h) for x, y in floor_polygon]

        return {
            "floor_polygon": norm_polygon,
            "room_width_cm": float(room_width),
            "room_depth_cm": float(room_depth),
            "floor_y": -1.5,
            "perspective_fov": float(fov),
            "vanishing_point": (float(vp[0]) / w, float(vp[1]) / h),
            "camera_position": cam_pos,
            "camera_rotation": cam_rot,
            "suggested_placements": placements,
            "confidence": float(min(confidence, 1.0)),
        }

    except Exception as e:
        logger.error(f"Room analysis failed: {e}")
        return _default_analysis()


def _detect_floor_mask(
    depth: np.ndarray, img: np.ndarray, h: int, w: int
) -> Tuple[np.ndarray, List[Tuple[int, int]], float]:
    """
    Detect floor region using depth map analysis.
    The floor is typically the nearest (brightest in depth map) horizontal surface
    in the lower portion of the image.
    """
    # Enhance depth contrast
    depth_eq = cv2.equalizeHist(depth)

    # The floor is usually in the bottom 50% and is the brightest (nearest) region
    # Use adaptive thresholding on the bottom half
    bottom_half = depth_eq[h // 2:, :]
    thresh_val = np.percentile(bottom_half, 60)

    # Create initial floor mask (bright = close = floor)
    floor_mask = np.zeros((h, w), dtype=np.uint8)
    floor_mask[depth_eq > thresh_val] = 255

    # Only keep bottom 60% (floor is rarely in upper image)
    floor_mask[:int(h * 0.4), :] = 0

    # Morphological cleanup
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    floor_mask = cv2.morphologyEx(floor_mask, cv2.MORPH_CLOSE, kernel)
    floor_mask = cv2.morphologyEx(floor_mask, cv2.MORPH_OPEN, kernel)

    # Also use color-based floor detection (floors tend to be uniform color)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    bottom_region = hsv[int(h * 0.7):, :]
    avg_hue = np.mean(bottom_region[:, :, 0])
    avg_sat = np.mean(bottom_region[:, :, 1])

    # Color similarity mask for bottom region
    color_mask = np.zeros((h, w), dtype=np.uint8)
    hue_diff = np.abs(hsv[:, :, 0].astype(float) - avg_hue)
    sat_diff = np.abs(hsv[:, :, 1].astype(float) - avg_sat)
    color_similar = (hue_diff < 30) & (sat_diff < 60)
    color_mask[color_similar] = 255
    color_mask[:int(h * 0.4), :] = 0

    # Combine depth-based and color-based masks
    combined = cv2.bitwise_and(floor_mask, color_mask)

    # If combined is too small, fallback to depth-only
    if np.sum(combined > 0) < (h * w * 0.05):
        combined = floor_mask

    # Find the largest contour (main floor area)
    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        # Fallback: assume bottom trapezoid is floor
        polygon = _default_floor_polygon(h, w)
        fallback_mask = np.zeros((h, w), dtype=np.uint8)
        pts = np.array(polygon, dtype=np.int32)
        cv2.fillPoly(fallback_mask, [pts], 255)
        return fallback_mask, polygon, 0.3

    # Get largest contour
    largest = max(contours, key=cv2.contourArea)
    area_ratio = cv2.contourArea(largest) / (h * w)

    # Simplify contour to polygon
    epsilon = 0.02 * cv2.arcLength(largest, True)
    approx = cv2.approxPolyDP(largest, epsilon, True)
    polygon = [(int(pt[0][0]), int(pt[0][1])) for pt in approx]

    # Create clean mask from the polygon
    clean_mask = np.zeros((h, w), dtype=np.uint8)
    pts = np.array(polygon, dtype=np.int32)
    cv2.fillPoly(clean_mask, [pts], 255)

    confidence = min(0.9, 0.3 + area_ratio * 2)

    return clean_mask, polygon, confidence


def _default_floor_polygon(h: int, w: int) -> List[Tuple[int, int]]:
    """Default trapezoid floor polygon (perspective view of a floor)."""
    return [
        (int(w * 0.15), int(h * 0.55)),
        (int(w * 0.85), int(h * 0.55)),
        (int(w * 0.95), int(h * 0.95)),
        (int(w * 0.05), int(h * 0.95)),
    ]


def _estimate_room_dimensions(
    depth: np.ndarray, floor_mask: np.ndarray, h: int, w: int
) -> Tuple[float, float]:
    """
    Estimate approximate room dimensions in cm from depth map.
    Uses the floor region extent and depth values.
    """
    # Find floor bounding box
    coords = np.where(floor_mask > 0)
    if len(coords[0]) == 0:
        return 400.0, 300.0

    y_min, y_max = coords[0].min(), coords[0].max()
    x_min, x_max = coords[1].min(), coords[1].max()

    # Floor width in pixels
    floor_width_px = x_max - x_min
    floor_depth_px = y_max - y_min

    # Depth values on the floor
    floor_depths = depth[floor_mask > 0]
    near_depth = np.percentile(floor_depths, 90)  # Closest point
    far_depth = np.percentile(floor_depths, 10)    # Farthest point
    depth_range = max(1, near_depth - far_depth)

    # Heuristic scaling: assume typical room is 3-6m wide
    # Scale based on floor coverage of image
    width_ratio = floor_width_px / w
    depth_ratio = floor_depth_px / h

    room_width = 300 + width_ratio * 400  # 300-700 cm
    room_depth = 250 + depth_ratio * 350  # 250-600 cm

    return round(room_width, 0), round(room_depth, 0)


def _estimate_vanishing_point(
    img: np.ndarray, h: int, w: int
) -> Tuple[Tuple[int, int], float]:
    """Estimate vanishing point using Hough line detection."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150, apertureSize=3)

    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 80, minLineLength=50, maxLineGap=10)

    if lines is None or len(lines) < 2:
        return (w // 2, int(h * 0.35)), 0.2

    intersections = []
    for i in range(len(lines)):
        for j in range(i + 1, min(len(lines), i + 20)):
            pt = _line_intersection(lines[i][0], lines[j][0])
            if pt is not None:
                px, py = pt
                if -w < px < 2 * w and -h < py < h:
                    intersections.append((px, py))

    if not intersections:
        return (w // 2, int(h * 0.35)), 0.2

    xs = [p[0] for p in intersections]
    ys = [p[1] for p in intersections]
    vp_x = int(np.median(xs))
    vp_y = int(np.median(ys))
    vp_x = max(0, min(w, vp_x))
    vp_y = max(0, min(h, vp_y))

    std_x = np.std(xs) if len(xs) > 1 else w
    std_y = np.std(ys) if len(ys) > 1 else h
    spread = (std_x / w + std_y / h) / 2
    confidence = max(0.2, min(0.9, 1.0 - spread))

    return (vp_x, vp_y), confidence


def _line_intersection(line1, line2) -> Optional[Tuple[int, int]]:
    """Find intersection point of two line segments."""
    x1, y1, x2, y2 = line1
    x3, y3, x4, y4 = line2
    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-10:
        return None
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
    px = x1 + t * (x2 - x1)
    py = y1 + t * (y2 - y1)
    return (int(px), int(py))


def _estimate_fov(vp: Tuple[int, int], h: int, w: int) -> float:
    """Estimate camera FOV from vanishing point position."""
    cx, cy = w / 2, h / 2
    dist = math.sqrt((vp[0] - cx) ** 2 + (vp[1] - cy) ** 2)
    diagonal = math.sqrt(w ** 2 + h ** 2)
    ratio = dist / diagonal
    fov = 45 + (1 - ratio) * 30
    return max(40.0, min(80.0, fov))


def _compute_camera(
    vp: Tuple[int, int], fov: float, h: int, w: int
) -> Tuple[Tuple[float, float, float], Tuple[float, float, float]]:
    """Compute camera position and rotation to match room perspective."""
    # Camera height: typical eye level ~1.5m
    cam_height = 1.5

    # Camera distance based on FOV
    fov_rad = math.radians(fov)
    cam_distance = 3.0 + (80 - fov) * 0.05  # Wider FOV = closer

    # Camera tilt based on vanishing point vertical position
    vp_y_norm = vp[1] / h  # 0 = top, 1 = bottom
    tilt = -(0.5 - vp_y_norm) * 0.8  # Look down if VP is above center

    # Horizontal offset based on VP horizontal position
    vp_x_norm = vp[0] / w
    x_offset = (vp_x_norm - 0.5) * -2.0

    cam_pos = (x_offset, cam_height, cam_distance)
    cam_rot = (tilt, 0.0, 0.0)

    return cam_pos, cam_rot


def _generate_placements(
    floor_polygon: List[Tuple[int, int]],
    floor_mask: np.ndarray,
    h: int, w: int,
) -> List[Dict[str, Any]]:
    """
    Generate AI-suggested furniture placement positions on the floor.
    Places suggestions at: center, left side, right side, against back wall.
    """
    if not floor_polygon or len(floor_polygon) < 3:
        return [{"position": (0, 0, 0), "label": "center"}]

    # Get floor bounding box
    coords = np.where(floor_mask > 0)
    if len(coords[0]) == 0:
        return [{"position": (0, 0, 0), "label": "center"}]

    y_min, y_max = coords[0].min(), coords[0].max()
    x_min, x_max = coords[1].min(), coords[1].max()

    # Convert pixel positions to 3D world coordinates
    # Map image coords to a -3..3 range
    def px_to_world(px_x: int, px_y: int) -> Tuple[float, float, float]:
        wx = (px_x / w - 0.5) * 6.0
        wz = -(px_y / h - 0.5) * 6.0  # Negative Z = into screen
        return (round(wx, 2), 0, round(wz, 2))

    # Center of floor
    cx = (x_min + x_max) // 2
    cy = (y_min + y_max) // 2

    placements = [
        {"position": px_to_world(cx, cy), "label": "center"},
    ]

    # Left side (1/4 from left edge)
    lx = x_min + (x_max - x_min) // 4
    ly = (y_min + y_max) // 2
    if floor_mask[ly, lx] > 0:
        placements.append({"position": px_to_world(lx, ly), "label": "left side"})

    # Right side
    rx = x_min + 3 * (x_max - x_min) // 4
    ry = (y_min + y_max) // 2
    if floor_mask[ry, rx] > 0:
        placements.append({"position": px_to_world(rx, ry), "label": "right side"})

    # Near back wall (upper part of floor region)
    bx = (x_min + x_max) // 2
    by = y_min + (y_max - y_min) // 4
    if floor_mask[by, bx] > 0:
        placements.append({"position": px_to_world(bx, by), "label": "back wall"})

    # Near front (lower part)
    fx = (x_min + x_max) // 2
    fy = y_min + 3 * (y_max - y_min) // 4
    if floor_mask[fy, fx] > 0:
        placements.append({"position": px_to_world(fx, fy), "label": "front area"})

    return placements


def _default_analysis() -> Dict[str, Any]:
    """Return default analysis when detection fails."""
    return {
        "floor_polygon": [(0.15, 0.55), (0.85, 0.55), (0.95, 0.95), (0.05, 0.95)],
        "room_width_cm": 400.0,
        "room_depth_cm": 300.0,
        "floor_y": -1.5,
        "perspective_fov": 60.0,
        "vanishing_point": (0.5, 0.35),
        "camera_position": (0, 1.5, 4),
        "camera_rotation": (-0.2, 0, 0),
        "suggested_placements": [
            {"position": (0, 0, 0), "label": "center"},
            {"position": (-1.5, 0, -0.5), "label": "left side"},
            {"position": (1.5, 0, -0.5), "label": "right side"},
        ],
        "confidence": 0.3,
    }
