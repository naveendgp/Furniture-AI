"""Local file and JSON storage utilities."""

import json
import os
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent
UPLOADS_DIR = BASE_DIR / "uploads"
DATA_DIR = BASE_DIR / "data"

# Ensure directories exist
FURNITURE_ORIGINALS = UPLOADS_DIR / "furniture" / "originals"
FURNITURE_PROCESSED = UPLOADS_DIR / "furniture" / "processed"
ROOM_ORIGINALS = UPLOADS_DIR / "rooms" / "originals"
ROOM_ANALYSIS = UPLOADS_DIR / "rooms" / "analysis"

for d in [FURNITURE_ORIGINALS, FURNITURE_PROCESSED, ROOM_ORIGINALS, ROOM_ANALYSIS, DATA_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# JSON storage paths
FURNITURE_DB = DATA_DIR / "furniture.json"
ROOMS_DB = DATA_DIR / "rooms.json"


def _ensure_json_file(path: Path) -> None:
    """Create JSON file with empty list if it doesn't exist."""
    if not path.exists():
        path.write_text("[]", encoding="utf-8")


def generate_id() -> str:
    """Generate a unique ID."""
    return str(uuid.uuid4())[:8]


def load_json(path: Path) -> List[Dict[str, Any]]:
    """Load a JSON array from file."""
    _ensure_json_file(path)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, FileNotFoundError):
        return []


def save_json(path: Path, data: List[Dict[str, Any]]) -> None:
    """Save a JSON array to file."""
    path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")


def add_item(path: Path, item: Dict[str, Any]) -> Dict[str, Any]:
    """Add an item to a JSON array file."""
    items = load_json(path)
    items.append(item)
    save_json(path, items)
    return item


def get_item(path: Path, item_id: str) -> Optional[Dict[str, Any]]:
    """Get an item by ID from a JSON array file."""
    items = load_json(path)
    for item in items:
        if item.get("id") == item_id:
            return item
    return None


def update_item(path: Path, item_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update an item by ID in a JSON array file."""
    items = load_json(path)
    for i, item in enumerate(items):
        if item.get("id") == item_id:
            items[i].update(updates)
            save_json(path, items)
            return items[i]
    return None


def delete_item(path: Path, item_id: str) -> bool:
    """Delete an item by ID from a JSON array file."""
    items = load_json(path)
    filtered = [item for item in items if item.get("id") != item_id]
    if len(filtered) < len(items):
        save_json(path, filtered)
        return True
    return False


def save_upload(content: bytes, directory: Path, filename: str) -> Path:
    """Save uploaded file bytes to a directory."""
    filepath = directory / filename
    filepath.write_bytes(content)
    return filepath
