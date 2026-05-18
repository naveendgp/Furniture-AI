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
            # isnet-general-use is much better for product/furniture photos
            # than u2net — it preserves edges and thin parts like legs
            _rembg_session = new_session("isnet-general-use")
            logger.info("rembg session initialized with isnet-general-use model")
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
        
        # Remove background with conservative settings:
        # - alpha_matting=True for smooth edges
        # - HIGH foreground threshold = keeps MORE of the furniture
        # - LOW background threshold = removes MORE background
        # - SMALL erode size = preserves thin parts (legs, handles)
        output_bytes = remove(
            input_bytes,
            session=session,
            bgcolor=None,  # Transparent background
            alpha_matting=True,
            alpha_matting_foreground_threshold=270,  # Very high = keep more foreground
            alpha_matting_background_threshold=20,   # Low = be aggressive removing BG
            alpha_matting_erode_size=5,               # Small = preserve thin parts
        )
        
        # Post-process: ensure no partial transparency on the furniture itself
        output_img = Image.open(io.BytesIO(output_bytes)).convert("RGBA")
        
        # Strengthen the alpha channel — anything above 50% alpha becomes fully opaque
        # This prevents the "faded edges" problem
        import numpy as np
        arr = np.array(output_img)
        alpha = arr[:, :, 3]
        alpha[alpha > 128] = 255  # Make semi-transparent furniture pixels fully opaque
        alpha[alpha <= 30] = 0    # Make near-transparent pixels fully transparent
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
