"""Room upload and analysis router."""

import logging
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, UploadFile, HTTPException, Body, Form

from models.schemas import RoomAnalysisResult, RoomUploadResponse, FloorAdjustment
from services.depth_estimation import estimate_depth
from services.room_analysis import analyze_room
from utils.storage import (
    ROOMS_DB, ROOM_ORIGINALS, ROOM_ANALYSIS,
    add_item, generate_id, get_item, load_json, save_upload, update_item,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/rooms", tags=["rooms"])


@router.post("/upload", response_model=RoomUploadResponse)
async def upload_room(
    image: UploadFile = File(...),
    width_cm: float = Form(None),
    length_cm: float = Form(None),
):
    """Upload a room image and run full AI analysis pipeline."""
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    room_id = generate_id()
    ext = Path(image.filename or "room.jpg").suffix or ".jpg"
    original_filename = f"{room_id}{ext}"
    depth_filename = f"{room_id}_depth.png"
    floor_mask_filename = f"{room_id}_floor_mask.png"

    content = await image.read()
    original_path = save_upload(content, ROOM_ORIGINALS, original_filename)

    # Step 1: Depth map
    depth_path = ROOM_ANALYSIS / depth_filename
    try:
        estimate_depth(original_path, depth_path)
    except Exception as e:
        logger.error(f"Depth estimation failed: {e}")
        from services.depth_estimation import _generate_fallback_depth
        _generate_fallback_depth(original_path, depth_path)

    # Step 2: Full room analysis (floor mask, polygon, dimensions, placements)
    floor_mask_path = ROOM_ANALYSIS / floor_mask_filename
    try:
        analysis = analyze_room(original_path, depth_path, floor_mask_path)
    except Exception as e:
        logger.error(f"Room analysis failed: {e}")
        analysis = {
            "floor_polygon": [(0.15, 0.55), (0.85, 0.55), (0.95, 0.95), (0.05, 0.95)],
            "room_width_cm": 400.0, "room_depth_cm": 300.0,
            "floor_y": -1.5, "perspective_fov": 60.0,
            "vanishing_point": (0.5, 0.35),
            "camera_position": (0, 1.5, 4), "camera_rotation": (-0.2, 0, 0),
            "suggested_placements": [{"position": (0, 0, 0), "label": "center"}],
            "confidence": 0.3,
        }

    # Override AI fallback if exact dimensions are provided
    if width_cm is not None:
        analysis["room_width_cm"] = width_cm
    if length_cm is not None:
        analysis["room_depth_cm"] = length_cm

    # Convert tuples to lists for JSON serialization
    def to_list(v):
        if isinstance(v, tuple):
            return list(v)
        return v

    room_data = {
        "id": room_id,
        "image_path": f"/uploads/rooms/originals/{original_filename}",
        "depth_map_path": f"/uploads/rooms/analysis/{depth_filename}",
        "floor_mask_path": f"/uploads/rooms/analysis/{floor_mask_filename}",
        "floor_polygon": [list(p) for p in analysis["floor_polygon"]],
        "room_width_cm": analysis["room_width_cm"],
        "room_depth_cm": analysis["room_depth_cm"],
        "floor_y": analysis["floor_y"],
        "perspective_fov": analysis["perspective_fov"],
        "vanishing_point": list(analysis["vanishing_point"]),
        "camera_position": list(analysis["camera_position"]),
        "camera_rotation": list(analysis["camera_rotation"]),
        "suggested_placements": [
            {"position": list(p["position"]), "label": p["label"]}
            for p in analysis["suggested_placements"]
        ],
        "confidence": analysis["confidence"],
        "created_at": datetime.now().isoformat(),
    }

    add_item(ROOMS_DB, room_data)
    logger.info(f"Room analyzed: id={room_id}, confidence={analysis['confidence']:.2f}, "
                f"floor polygon has {len(analysis['floor_polygon'])} points")

    return RoomUploadResponse(**room_data)


@router.get("/{room_id}", response_model=RoomAnalysisResult)
async def get_room(room_id: str):
    room = get_item(ROOMS_DB, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if isinstance(room.get("vanishing_point"), list):
        room["vanishing_point"] = tuple(room["vanishing_point"])
    if isinstance(room.get("camera_position"), list):
        room["camera_position"] = tuple(room["camera_position"])
    if isinstance(room.get("camera_rotation"), list):
        room["camera_rotation"] = tuple(room["camera_rotation"])
    room["floor_polygon"] = [tuple(p) for p in room.get("floor_polygon", [])]
    for sp in room.get("suggested_placements", []):
        if isinstance(sp.get("position"), list):
            sp["position"] = tuple(sp["position"])
    return RoomAnalysisResult(**room)


@router.get("")
async def list_rooms():
    rooms = load_json(ROOMS_DB)
    return {"items": rooms, "total": len(rooms)}


@router.post("/{room_id}/adjust", response_model=RoomAnalysisResult)
async def adjust_room(room_id: str, adjustment: FloorAdjustment = Body(...)):
    room = get_item(ROOMS_DB, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    updates = {}
    if adjustment.floor_y is not None:
        updates["floor_y"] = adjustment.floor_y
    if adjustment.perspective_fov is not None:
        updates["perspective_fov"] = adjustment.perspective_fov
    if adjustment.vanishing_point is not None:
        updates["vanishing_point"] = list(adjustment.vanishing_point)

    if updates:
        updates["confidence"] = 1.0
        updated = update_item(ROOMS_DB, room_id, updates)
        if updated:
            if isinstance(updated.get("vanishing_point"), list):
                updated["vanishing_point"] = tuple(updated["vanishing_point"])
            if isinstance(updated.get("camera_position"), list):
                updated["camera_position"] = tuple(updated["camera_position"])
            if isinstance(updated.get("camera_rotation"), list):
                updated["camera_rotation"] = tuple(updated["camera_rotation"])
            updated["floor_polygon"] = [tuple(p) for p in updated.get("floor_polygon", [])]
            for sp in updated.get("suggested_placements", []):
                if isinstance(sp.get("position"), list):
                    sp["position"] = tuple(sp["position"])
            return RoomAnalysisResult(**updated)

    if isinstance(room.get("vanishing_point"), list):
        room["vanishing_point"] = tuple(room["vanishing_point"])
    return RoomAnalysisResult(**room)
