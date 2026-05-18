"""
Advanced background removal using SAM2 and rembg.
"""

import logging
import cv2
import numpy as np
from pathlib import Path
from typing import Tuple
import requests
from PIL import Image
from io import BytesIO

logger = logging.getLogger(__name__)


def remove_background_rembg(image_path: Path, output_path: Path) -> None:
    """
    Remove background using rembg (lightweight, fast).
    Produces transparent PNG.
    """
    try:
        from rembg import remove
        
        logger.info(f"Removing background with rembg: {image_path.name}")
        
        # Read image
        with open(image_path, "rb") as f:
            input_data = f.read()
        
        # Remove background
        output_data = remove(input_data)
        
        # Save PNG
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(output_data)
        
        logger.info(f"Background removed: {output_path.name}")
        
    except ImportError:
        logger.error("rembg not installed: pip install rembg[cpu]")
        raise


def remove_background_sam2(image_path: Path, output_path: Path) -> None:
    """
    Remove background using SAM2 (high quality, slower).
    Produces transparent PNG with alpha channel.
    """
    try:
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor
        import torch
        
        logger.info(f"Removing background with SAM2: {image_path.name}")
        
        # Initialize model
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model_cfg = "sam2_hiera_l.yaml"
        sam2_model = build_sam2(model_cfg, checkpoint="sam2_hiera_large.pt", device=device)
        predictor = SAM2ImagePredictor(sam2_model)
        
        # Read image
        image = cv2.imread(str(image_path))
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Run prediction on full image
        predictor.set_image(image_rgb)
        masks, scores, logits = predictor.predict(
            point_coords=None,
            point_labels=None,
            multimask_output=False,
        )
        
        # Process mask
        mask = masks[0].astype(np.uint8) * 255
        
        # Create RGBA image
        image_bgra = cv2.cvtColor(image, cv2.COLOR_BGR2BGRA)
        image_bgra[:, :, 3] = mask
        
        # Save
        output_path.parent.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(output_path), image_bgra)
        
        logger.info(f"Background removed with SAM2: {output_path.name}")
        
    except ImportError:
        logger.error("SAM2 not installed. Falling back to rembg.")
        remove_background_rembg(image_path, output_path)
    except Exception as e:
        logger.error(f"SAM2 background removal failed: {e}. Falling back to rembg.")
        remove_background_rembg(image_path, output_path)


def remove_background(image_path: Path, output_path: Path, method: str = "rembg") -> None:
    """
    Remove background from furniture image.
    
    Args:
        image_path: Input image path
        output_path: Output PNG path (with transparency)
        method: "rembg" (fast) or "sam2" (high quality)
    """
    if method == "sam2":
        try:
            remove_background_sam2(image_path, output_path)
        except Exception as e:
            logger.warning(f"SAM2 failed: {e}. Falling back to rembg.")
            remove_background_rembg(image_path, output_path)
    else:
        remove_background_rembg(image_path, output_path)


def get_object_mask(image_path: Path) -> np.ndarray:
    """
    Get binary mask of object (furniture).
    Returns mask where object=255, background=0.
    """
    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError(f"Cannot read image: {image_path}")
    
    # Convert to HSV for better segmentation
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    
    # Apply morphological operations
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    
    # Threshold to get object
    lower_saturation = np.array([0, 30, 30])
    upper_saturation = np.array([180, 255, 255])
    mask = cv2.inRange(hsv, lower_saturation, upper_saturation)
    
    # Clean up
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    
    return mask


def extract_object_contour(image_path: Path) -> Tuple[np.ndarray, float]:
    """
    Extract main object contour.
    
    Returns:
        (contour, area)
    """
    mask = get_object_mask(image_path)
    
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        logger.warning(f"No contours found in {image_path.name}")
        return np.array([]), 0
    
    # Get largest contour
    largest_contour = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(largest_contour)
    
    return largest_contour, area


def validate_background_removal(bg_removed_path: Path, original_path: Path) -> bool:
    """
    Validate that background removal was successful.
    """
    if not bg_removed_path.exists():
        logger.warning(f"Background removed image does not exist: {bg_removed_path}")
        return False
    
    bg_removed = cv2.imread(str(bg_removed_path), cv2.IMREAD_UNCHANGED)
    if bg_removed is None:
        logger.warning(f"Cannot read background removed image: {bg_removed_path}")
        return False
    
    if len(bg_removed.shape) < 3 or bg_removed.shape[2] != 4:
        logger.warning(f"Background removed image has no alpha channel: {bg_removed_path}")
        return False
    
    alpha = bg_removed[:, :, 3]
    object_pixels = np.sum(alpha > 128)
    total_pixels = alpha.shape[0] * alpha.shape[1]
    object_ratio = object_pixels / total_pixels
    
    if object_ratio < 0.1:
        logger.warning(f"Object occupies less than 10% of image: {object_ratio:.1%}")
        return False
    
    if object_ratio > 0.95:
        logger.warning(f"Object occupies more than 95% of image: {object_ratio:.1%}")
        return False
    
    logger.info(f"Background removal validated for {bg_removed_path.name}: {object_ratio:.1%} object")
    return True


def enhance_object_visibility(image_path: Path, output_path: Path) -> None:
    """
    Enhance object visibility for reconstruction.
    """
    image = cv2.imread(str(image_path), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise ValueError(f"Cannot read image: {image_path}")
    
    if len(image.shape) < 3 or image.shape[2] != 4:
        logger.warning("Image does not have alpha channel, adding white background")
        image_rgb = cv2.cvtColor(image[:, :, :3], cv2.COLOR_BGR2RGB)
        image_bgra = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGRA)
        image_bgra[:, :, 3] = 255
        image = image_bgra
    
    # Enhance contrast on RGB channels
    rgb = image[:, :, :3]
    alpha = image[:, :, 3]
    
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    for i in range(3):
        rgb[:, :, i] = clahe.apply(rgb[:, :, i])
    
    result = cv2.merge([rgb, alpha])
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), result)
    
    logger.info(f"Enhanced object visibility: {output_path.name}")
