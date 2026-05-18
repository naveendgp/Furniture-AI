"""Depth estimation service using Depth Anything V2 via HuggingFace transformers."""

import logging
import numpy as np
from pathlib import Path
from PIL import Image

logger = logging.getLogger(__name__)

# Lazy-load the model pipeline
_depth_pipeline = None


def _get_pipeline():
    """Get or create depth estimation pipeline (lazy initialization)."""
    global _depth_pipeline
    if _depth_pipeline is None:
        try:
            from transformers import pipeline
            _depth_pipeline = pipeline(
                task="depth-estimation",
                model="depth-anything/Depth-Anything-V2-Small-hf",
                device="cpu",
            )
            logger.info("Depth Anything V2 pipeline initialized")
        except Exception as e:
            logger.warning(f"Failed to load Depth Anything V2: {e}. Using fallback.")
            _depth_pipeline = "fallback"
    return _depth_pipeline


def estimate_depth(input_path: Path, output_path: Path) -> Path:
    """
    Estimate depth map from a room image.
    
    Args:
        input_path: Path to the room image
        output_path: Path to save the depth map
        
    Returns:
        Path to the depth map image
    """
    try:
        pipe = _get_pipeline()
        
        if pipe == "fallback":
            return _generate_fallback_depth(input_path, output_path)
        
        # Load and process image
        image = Image.open(input_path).convert("RGB")
        
        # Run depth estimation
        result = pipe(image)
        depth_map = result["depth"]
        
        # Convert to grayscale image and save
        if isinstance(depth_map, Image.Image):
            depth_img = depth_map.convert("L")
        else:
            # Handle numpy array output
            depth_array = np.array(depth_map)
            # Normalize to 0-255
            depth_normalized = (
                (depth_array - depth_array.min())
                / (depth_array.max() - depth_array.min() + 1e-8)
                * 255
            ).astype(np.uint8)
            depth_img = Image.fromarray(depth_normalized, mode="L")
        
        depth_img.save(output_path, "PNG")
        logger.info(f"Depth map generated: {output_path.name}")
        return output_path
        
    except Exception as e:
        logger.error(f"Depth estimation failed: {e}")
        return _generate_fallback_depth(input_path, output_path)


def _generate_fallback_depth(input_path: Path, output_path: Path) -> Path:
    """
    Generate a simple gradient-based fallback depth map.
    Assumes floor is at the bottom (closer) and ceiling/back wall is at the top (farther).
    """
    img = Image.open(input_path).convert("RGB")
    w, h = img.size
    
    # Create a vertical gradient (dark at top = far, bright at bottom = near)
    depth_array = np.zeros((h, w), dtype=np.uint8)
    for y in range(h):
        value = int((y / h) * 255)
        depth_array[y, :] = value
    
    depth_img = Image.fromarray(depth_array, mode="L")
    depth_img.save(output_path, "PNG")
    logger.info(f"Fallback depth map generated: {output_path.name}")
    return output_path
