"""Background removal service using rembg.

Uses isnet-general-use model for better furniture segmentation.
Tuned to preserve complete furniture outlines without cutting edges.
"""

import io
import logging
from pathlib import Path
from PIL import Image

logger = logging.getLogger(__name__)

# Lazy-load rembg to avoid slow startup
_rembg_session = None


def _get_session():
    """Get or create rembg session (lazy initialization)."""
    global _rembg_session
    if _rembg_session is None:
        try:
            from rembg import new_session
            # birefnet-general is the best rembg model for complex scenes
            # — handles indoor backgrounds, shadows, and dark objects much
            # better than isnet-general-use or u2net
            _rembg_session = new_session("birefnet-general")
            logger.info("rembg session initialized with birefnet-general model")
        except ImportError:
            logger.warning("rembg not installed, using fallback background removal")
            _rembg_session = "fallback"
    return _rembg_session


def remove_background(input_path: Path, output_path: Path) -> Path:
    """
    Remove background from a furniture image.
    
    Uses conservative settings to avoid cutting furniture parts.
    The isnet-general-use model is specifically designed for product photos
    and preserves fine details like legs, handles, and thin edges.
    
    Args:
        input_path: Path to the original furniture image
        output_path: Path to save the processed transparent PNG
        
    Returns:
        Path to the processed image
    """
    try:
        session = _get_session()
        
        if session == "fallback":
            # Fallback: just convert to RGBA PNG without actual BG removal
            logger.warning("Using fallback (no actual background removal)")
            img = Image.open(input_path).convert("RGBA")
            img.save(output_path, "PNG")
            return output_path
        
        from rembg import remove
        
        # Read input image
        input_bytes = input_path.read_bytes()
        
        # Remove background — NO alpha_matting.
        # Alpha matting causes Cholesky decomposition crashes on video frames
        # with complex indoor backgrounds (shadows, blinds, reflections).
        # Clean rembg without matting is more reliable; the temporal
        # consensus pipeline handles edge smoothing separately.
        output_bytes = remove(
            input_bytes,
            session=session,
            bgcolor=None,  # Transparent background
            alpha_matting=False,
        )
        
        # Minimal post-processing: just clean up near-zero noise
        output_img = Image.open(io.BytesIO(output_bytes)).convert("RGBA")
        import numpy as np
        arr = np.array(output_img)
        alpha = arr[:, :, 3]
        alpha[alpha <= 10] = 0  # Kill truly invisible noise pixels only
        arr[:, :, 3] = alpha
        output_img = Image.fromarray(arr)
        
        output_img.save(output_path, "PNG", optimize=True)
        
        logger.info(f"Background removed: {input_path.name} -> {output_path.name}")
        return output_path
        
    except Exception as e:
        logger.error(f"Background removal failed: {e}")
        # Fallback: copy as RGBA
        img = Image.open(input_path).convert("RGBA")
        img.save(output_path, "PNG")
        return output_path


def extract_silhouette(image_path: Path, target_size: int = 512) -> 'np.ndarray':
    """
    Extract a binary silhouette mask from a background-removed image.
    
    Used by the Visual Hull reconstruction engine.
    White pixels = furniture foreground, black = background.
    
    Args:
        image_path: Path to a background-removed PNG (with alpha channel)
        target_size: Resize to this square resolution
        
    Returns:
        Binary mask as numpy array (H x W), uint8, values 0 or 255
    """
    import numpy as np
    
    img = Image.open(image_path).convert("RGBA")
    img = img.resize((target_size, target_size), Image.Resampling.LANCZOS)
    
    # Alpha channel > threshold = foreground
    alpha = np.array(img)[:, :, 3]
    mask = np.zeros((target_size, target_size), dtype=np.uint8)
    mask[alpha > 30] = 255
    
    # Morphological cleanup — remove noise and fill small holes
    import cv2
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    
    return mask
