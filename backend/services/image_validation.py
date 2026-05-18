"""
Image validation service for multi-view furniture uploads.

Validates:
- Image sharpness (blur detection)
- Lighting consistency across views
- Object visibility / sufficient foreground area
- Angle coverage (enough views for reconstruction)
"""

import logging
from pathlib import Path
from typing import List, Dict, Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Quality thresholds
SHARPNESS_THRESHOLD = 50.0
FOREGROUND_MIN_RATIO = 0.05
LIGHTING_VARIANCE_MAX = 80.0

REQUIRED_ANGLES = ["front", "left", "right", "back"]
OPTIONAL_ANGLES = ["front_left", "front_right", "back_left", "back_right"]
ALL_ANGLES = REQUIRED_ANGLES + OPTIONAL_ANGLES


def validate_image_sharpness(image_path: Path) -> Dict[str, Any]:
    """Check if an image is sharp enough using Laplacian variance."""
    img = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
    if img is None:
        return {"passed": False, "score": 0, "message": "Cannot read image"}
    img = cv2.resize(img, (512, 512))
    laplacian = cv2.Laplacian(img, cv2.CV_64F)
    score = float(laplacian.var())
    passed = score >= SHARPNESS_THRESHOLD
    message = "Sharp enough" if passed else f"Too blurry (score: {score:.0f}, need >= {SHARPNESS_THRESHOLD})"
    return {"passed": passed, "score": round(score, 1), "message": message}


def validate_object_visibility(image_path: Path) -> Dict[str, Any]:
    """Check if furniture is clearly visible and fills enough of the frame."""
    img = cv2.imread(str(image_path))
    if img is None:
        return {"passed": False, "foreground_ratio": 0, "message": "Cannot read image"}
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    edges = cv2.Canny(gray, 50, 150)
    mask = np.zeros_like(edges, dtype=np.float32)
    cy, cx = h // 2, w // 2
    cv2.ellipse(mask, (cx, cy), (int(w * 0.45), int(h * 0.45)), 0, 0, 360, 1.0, -1)
    weighted_edges = edges.astype(np.float32) * mask
    foreground_ratio = float(np.mean(weighted_edges > 0))
    std_dev = float(np.std(gray))
    passed = foreground_ratio >= 0.01 and std_dev >= 20
    message = "Object clearly visible" if passed else "Furniture may not be clearly visible"
    return {"passed": passed, "foreground_ratio": round(foreground_ratio, 3), "message": message}


def validate_lighting_consistency(image_paths: List[Path]) -> Dict[str, Any]:
    """Check if lighting is consistent across views."""
    brightness_values = []
    for path in image_paths:
        img = cv2.imread(str(path))
        if img is None:
            continue
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        brightness_values.append(float(np.mean(gray)))
    if len(brightness_values) < 2:
        return {"passed": True, "brightness_values": brightness_values, "message": "Not enough images to compare"}
    std = float(np.std(brightness_values))
    passed = std <= LIGHTING_VARIANCE_MAX
    message = "Lighting is consistent" if passed else f"Lighting varies too much (std: {std:.0f})"
    return {"passed": passed, "brightness_values": [round(b, 1) for b in brightness_values], "brightness_std": round(std, 1), "message": message}


def validate_angle_coverage(angle_labels: List[str]) -> Dict[str, Any]:
    """Check if uploaded angles provide sufficient coverage."""
    labels_set = set(angle_labels)
    missing_required = [a for a in REQUIRED_ANGLES if a not in labels_set]
    missing_optional = [a for a in OPTIONAL_ANGLES if a not in labels_set]
    total_provided = len([a for a in angle_labels if a in ALL_ANGLES])
    coverage_score = total_provided / len(ALL_ANGLES)
    passed = len(missing_required) == 0
    if not passed:
        message = f"Missing required angles: {', '.join(missing_required)}"
    elif coverage_score >= 0.75:
        message = "Excellent angle coverage"
    else:
        message = "Good coverage — adding more angles would improve quality"
    return {"passed": passed, "coverage_score": round(coverage_score, 2), "total_views": len(angle_labels), "missing_required": missing_required, "missing_optional": missing_optional, "message": message}


def validate_all(image_paths: List[Path], angle_labels: List[str]) -> Dict[str, Any]:
    """Run all validation checks on a multi-view upload."""
    sharpness_results = [validate_image_sharpness(p) for p in image_paths]
    visibility_results = [validate_object_visibility(p) for p in image_paths]
    lighting_result = validate_lighting_consistency(image_paths)
    coverage_result = validate_angle_coverage(angle_labels)
    all_sharp = all(r["passed"] for r in sharpness_results)
    all_visible = all(r["passed"] for r in visibility_results)
    coverage_ok = coverage_result["passed"]
    overall = all_sharp and all_visible and coverage_ok
    warnings = []
    if not lighting_result["passed"]:
        warnings.append(lighting_result["message"])
    return {"overall_passed": overall, "sharpness": sharpness_results, "visibility": visibility_results, "lighting": lighting_result, "coverage": coverage_result, "warnings": warnings, "message": "All checks passed" if overall else "Some validation checks failed"}
