"""Furniture router — serves catalog + single-image Quick Preview + multi-view 2.5D sprites."""

import logging
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import APIRouter, File, Form, UploadFile, HTTPException

from models.schemas import FurnitureItem, FurnitureListResponse
from services.background_removal import remove_background
from services.catalog import get_builtin_catalog
from services.model_generation import is_3d_generation_available, generate_3d_model
from utils.storage import (
    FURNITURE_DB, FURNITURE_ORIGINALS, FURNITURE_PROCESSED,
    add_item, delete_item, generate_id, get_item, load_json, save_upload, update_item,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/furniture", tags=["furniture"])

# Directories
MODELS_DIR = Path(__file__).resolve().parent.parent / "uploads" / "furniture" / "models"
MULTIVIEW_DIR = Path(__file__).resolve().parent.parent / "uploads" / "furniture" / "multiview"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
MULTIVIEW_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/catalog")
async def get_catalog():
    """Return the built-in furniture catalog."""
    catalog = get_builtin_catalog()
    items = []
    for c in catalog:
        items.append({
            "id": c["id"],
            "name": c["name"],
            "category": c["category"],
            "width": c["width"],
            "height": c["height"],
            "depth": c["depth"],
            "original_image": "",
            "processed_image": "",
            "angle_images": [],
            "sprite_sheet": None,
            "angle_count": 0,
            "model_url": c.get("model_url", ""),
            "thumbnail": c.get("thumbnail", ""),
            "builtin": True,
            "created_at": "",
        })
    return {"items": items, "total": len(items)}


@router.post("/upload")
async def upload_furniture(
    name: str = Form(...),
    category: str = Form(...),
    width: float = Form(100),
    height: float = Form(100),
    depth: float = Form(50),
    image: UploadFile = File(...),
):
    """
    Quick Preview Mode — single image upload.
    Stores the image with background removal. Attempts 3D generation via HuggingFace.
    """
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    item_id = generate_id()
    ext = Path(image.filename or "img.png").suffix or ".png"
    original_filename = f"{item_id}{ext}"
    processed_filename = f"{item_id}.png"

    content = await image.read()
    original_path = save_upload(content, FURNITURE_ORIGINALS, original_filename)

    # Background removal
    processed_path = FURNITURE_PROCESSED / processed_filename
    try:
        remove_background(original_path, processed_path)
    except Exception as e:
        logger.error(f"BG removal failed: {e}")
        save_upload(content, FURNITURE_PROCESSED, processed_filename)

    # Attempt 3D model generation via TripoSR
    model_url = None
    generation_status = "unavailable"

    if is_3d_generation_available():
        generation_status = "processing"
        logger.info(f"TripoSR: Starting 3D generation for {item_id}...")
        try:
            model_path = await generate_3d_model(
                image_path=processed_path,
                output_dir=MODELS_DIR,
                item_id=item_id,
            )
            if model_path:
                model_url = model_path
                generation_status = "completed"
                logger.info(f"TripoSR: 3D model ready for {item_id}")
            else:
                generation_status = "failed"
        except Exception as e:
            logger.error(f"TripoSR generation error: {e}")
            generation_status = "failed"
    else:
        logger.info("TripoSR: gradio_client not installed — storing 2D image only")

    item_data = {
        "id": item_id,
        "name": name,
        "category": category,
        "width": width,
        "height": height,
        "depth": depth,
        "original_image": f"/uploads/furniture/originals/{original_filename}",
        "processed_image": f"/uploads/furniture/processed/{processed_filename}",
        "angle_images": [],
        "sprite_sheet": None,
        "angle_count": 0,
        "model_url": model_url or "",
        "thumbnail": "",
        "builtin": False,
        "generation_status": generation_status,
        "upload_mode": "quick",
        "created_at": datetime.now().isoformat(),
    }

    add_item(FURNITURE_DB, item_data)
    logger.info(f"Furniture saved: {name} (id={item_id}, 3d={generation_status})")

    return item_data


# ─── Multi-View 2.5D Upload ───────────────────────────────────────────

@router.post("/upload-multiview")
async def upload_multiview_furniture(
    name: str = Form(...),
    category: str = Form(...),
    width: float = Form(100),
    height: float = Form(100),
    depth: float = Form(50),
    angles: str = Form(...),  # Comma-separated angle labels: "front,left,right,back,front_left"
    images: List[UploadFile] = File(...),
):
    """
    Multi-View 2.5D Mode — upload multiple angle images for view-dependent sprite rotation.
    
    Stores each image with background removal. The frontend renders the correct
    angle image based on the camera viewing direction, creating a 2.5D rotation effect.
    """
    angle_labels = [a.strip() for a in angles.split(",")]

    if len(images) != len(angle_labels):
        raise HTTPException(
            status_code=400,
            detail=f"Number of images ({len(images)}) must match number of angles ({len(angle_labels)})"
        )

    if len(images) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 images for multi-view")

    if len(images) > 12:
        raise HTTPException(status_code=400, detail="Maximum 12 images allowed")

    # Validate angle labels
    valid_angles = {"front", "front_left", "left", "back_left", "back", "back_right", "right", "front_right"}
    for label in angle_labels:
        if label not in valid_angles:
            raise HTTPException(status_code=400, detail=f"Invalid angle label: '{label}'. Valid: {valid_angles}")

    item_id = generate_id()

    # Save all uploaded images with background removal
    item_dir = MULTIVIEW_DIR / item_id
    item_dir.mkdir(parents=True, exist_ok=True)

    angle_image_urls = []
    for i, (img_file, label) in enumerate(zip(images, angle_labels)):
        if not img_file.content_type or not img_file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail=f"Image {i+1} is not a valid image file")

        ext = Path(img_file.filename or "img.png").suffix or ".png"
        raw_filename = f"{label}_raw{ext}"
        processed_filename = f"{label}.png"

        content = await img_file.read()
        raw_path = item_dir / raw_filename
        raw_path.write_bytes(content)

        # Background removal for each angle
        processed_path = item_dir / processed_filename
        try:
            remove_background(raw_path, processed_path)
        except Exception:
            # Fallback: just use the raw image
            import shutil
            shutil.copy2(raw_path, processed_path)

        angle_image_urls.append(f"/uploads/furniture/multiview/{item_id}/{processed_filename}")

    # Also save the front image as the main processed image
    processed_main = f"{item_id}.png"
    processed_main_path = FURNITURE_PROCESSED / processed_main
    front_processed = item_dir / "front.png"
    if front_processed.exists():
        import shutil
        shutil.copy2(front_processed, processed_main_path)
    elif angle_image_urls:
        # Use the first angle as fallback
        first_label = angle_labels[0]
        first_processed = item_dir / f"{first_label}.png"
        if first_processed.exists():
            import shutil
            shutil.copy2(first_processed, processed_main_path)

    # Create item record — immediately available (no reconstruction needed)
    item_data = {
        "id": item_id,
        "name": name,
        "category": category,
        "width": width,
        "height": height,
        "depth": depth,
        "original_image": angle_image_urls[0] if angle_image_urls else "",
        "processed_image": f"/uploads/furniture/processed/{processed_main}",
        "angle_images": angle_image_urls,
        "angle_labels": angle_labels,
        "sprite_sheet": None,
        "angle_count": len(images),
        "model_url": "",
        "thumbnail": "",
        "builtin": False,
        "generation_status": "completed",
        "upload_mode": "multiview",
        "created_at": datetime.now().isoformat(),
    }

    add_item(FURNITURE_DB, item_data)
    logger.info(f"Multi-view upload: {name} (id={item_id}, {len(images)} angles)")

    return item_data


# ─── Existing Endpoints ───────────────────────────────────────────────

@router.get("/generation-status")
async def generation_status():
    """Check if upload modes are available."""
    return {
        "available": True,
        "provider": "multiview_2.5d",
        "message": "Multi-view 2.5D sprite upload ready",
        "modes": {
            "quick_preview": True,
            "multiview_2.5d": True,
        }
    }


@router.get("/meshy-status")
async def meshy_status_compat():
    """Legacy endpoint — redirects to generation-status."""
    return await generation_status()


@router.get("", response_model=FurnitureListResponse)
async def list_furniture():
    items = load_json(FURNITURE_DB)
    return FurnitureListResponse(items=items, total=len(items))


@router.get("/{item_id}")
async def get_furniture(item_id: str):
    item = get_item(FURNITURE_DB, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Furniture item not found")
    return item


@router.post("/{item_id}/reprocess")
async def reprocess_furniture(item_id: str):
    """
    Re-run background removal on an existing furniture item.
    Useful after installing rembg to fix items that were uploaded without it.
    """
    item = get_item(FURNITURE_DB, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Furniture item not found")

    backend_root = Path(__file__).resolve().parent.parent
    reprocessed = 0

    # Re-process main processed image from original
    if item.get("original_image"):
        orig_path = backend_root / item["original_image"].lstrip("/")
        if orig_path.exists():
            proc_filename = f"{item_id}.png"
            proc_path = FURNITURE_PROCESSED / proc_filename
            try:
                remove_background(orig_path, proc_path)
                reprocessed += 1
                logger.info(f"Reprocessed main image: {item_id}")
            except Exception as e:
                logger.warning(f"Reprocess main failed: {e}")

    # Re-process multi-view angle images
    if item.get("angle_images") and item.get("angle_labels"):
        mv_dir = MULTIVIEW_DIR / item_id
        for label in item["angle_labels"]:
            raw_path = mv_dir / f"{label}_raw.png"
            # Try other extensions too
            if not raw_path.exists():
                for ext in [".jpg", ".jpeg", ".webp"]:
                    alt = mv_dir / f"{label}_raw{ext}"
                    if alt.exists():
                        raw_path = alt
                        break
            # If no raw, try the original angle image
            if not raw_path.exists():
                raw_path = mv_dir / f"{label}.png"

            if raw_path.exists():
                proc_path = mv_dir / f"{label}.png"
                try:
                    remove_background(raw_path, proc_path)
                    reprocessed += 1
                    logger.info(f"Reprocessed angle {label}: {item_id}")
                except Exception as e:
                    logger.warning(f"Reprocess {label} failed: {e}")

    # Update generation status
    update_item(FURNITURE_DB, item_id, {"generation_status": "completed"})

    return {"status": "reprocessed", "id": item_id, "images_reprocessed": reprocessed}


@router.post("/reprocess-all")
async def reprocess_all_furniture():
    """Re-run background removal on ALL existing furniture items."""
    items = load_json(FURNITURE_DB)
    results = []
    for item in items:
        if item.get("builtin"):
            continue
        try:
            result = await reprocess_furniture(item["id"])
            results.append(result)
        except Exception as e:
            results.append({"status": "failed", "id": item["id"], "error": str(e)})

    return {"total": len(results), "results": results}


@router.delete("/{item_id}")
async def delete_furniture(item_id: str):
    item = get_item(FURNITURE_DB, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Furniture item not found")

    # Delete files
    for key in ["original_image", "processed_image"]:
        if item.get(key):
            fp = Path(__file__).resolve().parent.parent / item[key].lstrip("/")
            if fp.exists():
                fp.unlink()

    # Delete GLB/OBJ model
    for ext in [".glb", ".obj"]:
        model_path = MODELS_DIR / f"{item_id}{ext}"
        if model_path.exists():
            model_path.unlink()

    # Delete multiview directory
    mv_dir = MULTIVIEW_DIR / item_id
    if mv_dir.exists():
        import shutil
        shutil.rmtree(mv_dir, ignore_errors=True)

    delete_item(FURNITURE_DB, item_id)
    return {"status": "deleted", "id": item_id}

