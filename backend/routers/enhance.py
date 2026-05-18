"""Enhance router — AI-powered V-Ray style rendering of room screenshots."""

import logging
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, UploadFile, HTTPException

from services.image_enhancement import enhance_room_image, is_enhancement_available
from utils.storage import generate_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/enhance", tags=["enhance"])

ENHANCE_DIR = Path(__file__).resolve().parent.parent / "uploads" / "enhanced"
ENHANCE_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/status")
async def enhancement_status():
    """Check if AI enhancement is available."""
    available = is_enhancement_available()
    return {
        "available": True,  # Always true — we have local fallback
        "ai_available": available,
        "message": "AI V-Ray rendering ready" if available else "Local enhancement ready (install gradio_client for AI rendering)",
    }


@router.post("")
async def enhance_screenshot(image: UploadFile = File(...)):
    """
    Enhance a room screenshot to V-Ray quality.

    Takes the composite canvas screenshot (room + furniture)
    and returns a photorealistic enhanced version.
    """
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    enhance_id = generate_id()
    ext = ".png"

    # Save uploaded screenshot
    content = await image.read()
    input_path = ENHANCE_DIR / f"{enhance_id}_input{ext}"
    input_path.write_bytes(content)

    output_path = ENHANCE_DIR / f"{enhance_id}_enhanced{ext}"

    logger.info(f"Enhancement requested: {enhance_id} ({len(content):,} bytes)")

    try:
        success = await enhance_room_image(input_path, output_path)

        if success and output_path.exists():
            file_size = output_path.stat().st_size
            logger.info(f"Enhancement complete: {enhance_id} ({file_size:,} bytes)")
            return {
                "id": enhance_id,
                "status": "completed",
                "enhanced_image": f"/uploads/enhanced/{enhance_id}_enhanced{ext}",
                "original_image": f"/uploads/enhanced/{enhance_id}_input{ext}",
                "file_size": file_size,
                "created_at": datetime.now().isoformat(),
            }
        else:
            raise HTTPException(status_code=500, detail="Enhancement failed — no output generated")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Enhancement error: {e}")
        raise HTTPException(status_code=500, detail=f"Enhancement failed: {str(e)}")
