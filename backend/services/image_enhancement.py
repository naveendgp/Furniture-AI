"""
AI Image Enhancement Service — V-Ray quality rendering.

Applies photorealistic AI rendering using Hugging Face Inference API.
Falls back to a professional V-Ray style color grading (PIL/OpenCV) if the AI fails.
"""

import asyncio
import logging
import os
import io
from pathlib import Path
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

logger = logging.getLogger(__name__)

HF_TOKEN = os.environ.get("HF_TOKEN")

# Enhancement prompt tuned for V-Ray-style interior renders
ENHANCE_PROMPT = (
    "photorealistic interior design render, professional architectural visualization, "
    "V-Ray quality rendering, perfect lighting, ambient occlusion, global illumination, "
    "realistic material textures, soft shadows, ray traced reflections, "
    "high resolution, ultra detailed, magazine quality photography, "
    "depth of field, warm natural lighting, clean and modern"
)

NEGATIVE_PROMPT = (
    "cartoon, anime, illustration, painting, sketch, drawing, "
    "low quality, blurry, distorted, deformed, watermark, text, "
    "oversaturated, unrealistic colors, artifacts, noise, pixelated"
)

def is_enhancement_available() -> bool:
    """Check if enhancement dependencies are available."""
    try:
        import numpy as np  # noqa: F401
        from PIL import Image  # noqa: F401
        return True
    except ImportError:
        return False


def _enhance_ai(image_path: Path, output_path: Path) -> bool:
    """Use Hugging Face Serverless Inference API for true SDXL Img2Img rendering."""
    if not HF_TOKEN:
        logger.info("No HF_TOKEN provided. Skipping AI rendering.")
        return False

    try:
        from huggingface_hub import InferenceClient
        
        logger.info("Connecting to Hugging Face Inference API (SD 1.5)...")
        # Initialize client with token
        client = InferenceClient(token=HF_TOKEN)
        
        # Open the image and convert to bytes
        with open(image_path, "rb") as f:
            image_bytes = f.read()

        logger.info("Sending image for AI rendering...")
        
        # Using SD 1.5 because SDXL is often restricted to text-to-image on free Serverless Inference APIs
        result_img = client.image_to_image(
            image=image_bytes,
            prompt=ENHANCE_PROMPT,
            negative_prompt=NEGATIVE_PROMPT,
            model="runwayml/stable-diffusion-v1-5",
            strength=0.35, # Preserve 65% of original image layout
            guidance_scale=7.5,
            num_inference_steps=25,
        )
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        result_img.save(output_path, "PNG", quality=100)
        logger.info("✅ True AI Photorealistic Render applied successfully!")
        return True

    except Exception as e:
        err_msg = str(e)
        logger.error(f"HF Inference API failed: {err_msg[:200]}")
        if "permissions" in err_msg.lower() or "403" in err_msg:
            logger.error("👉 NOTE: Your HF_TOKEN does not have the 'Make calls to the Serverless Inference API' permission checked!")
        return False


def _apply_vray_enhancement(image_path: Path, output_path: Path) -> bool:
    """
    Fallback: Apply local enhancement using PIL/NumPy.
    Simulates V-Ray-like look with contrast, vignette, and warm color grading.
    """
    try:
        logger.info("Applying local V-Ray style rendering effects (Fallback)...")
        img = Image.open(image_path).convert("RGB")

        # 1. High-pass sharpening to bring out textures
        img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=120, threshold=3))

        # 2. Boost contrast for deeper shadows
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(1.15)

        # 3. Warm color grading
        enhancer = ImageEnhance.Color(img)
        img = enhancer.enhance(1.1)

        # 4. Subtle brightness/exposure boost
        enhancer = ImageEnhance.Brightness(img)
        img = enhancer.enhance(1.05)

        # 5. Add cinematic vignette effect
        arr = np.array(img, dtype=np.float32)
        h, w = arr.shape[:2]
        Y, X = np.ogrid[:h, :w]
        cx, cy = w / 2, h / 2
        radius = max(w, h) * 0.7
        dist = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
        vignette = 1.0 - np.clip((dist - radius * 0.6) / (radius * 0.4), 0, 1) * 0.3
        vignette = vignette[..., np.newaxis]
        arr = arr * vignette
        
        # 6. Final clamp and save
        arr = np.clip(arr, 0, 255).astype(np.uint8)
        result = Image.fromarray(arr)
        
        output_path.parent.mkdir(parents=True, exist_ok=True)
        result.save(output_path, "PNG", quality=100)
        
        logger.info("Local V-Ray rendering applied successfully")
        return True

    except Exception as e:
        logger.error(f"Fallback rendering failed: {e}")
        return False


async def enhance_room_image(
    image_path: Path,
    output_path: Path,
    timeout_seconds: int = 120,
) -> bool:
    """
    Enhance a room screenshot. Tries AI first, then falls back to local.
    """
    def _run_pipeline():
        # 1. Try True AI Inference first
        if _enhance_ai(image_path, output_path):
            return True
        
        # 2. Fall back to local color grading
        return _apply_vray_enhancement(image_path, output_path)

    try:
        loop = asyncio.get_event_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(None, _run_pipeline),
            timeout=timeout_seconds,
        )
        return result
    except asyncio.TimeoutError:
        logger.error("AI enhancement timed out, falling back to local...")
        return _apply_vray_enhancement(image_path, output_path)
    except Exception as e:
        logger.error(f"Enhancement pipeline error: {e}")
        return False
