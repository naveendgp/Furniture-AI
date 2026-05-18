"""
Built-in furniture catalog.
Previously contained free GLB models from public CDNs, but they didn't render
properly so the catalog is now empty. Users add furniture via image upload +
AI 3D generation (TripoSR).
"""

import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

# Catalog is intentionally empty — the CDN-hosted free models didn't render
# correctly. All furniture now comes from user uploads with AI 3D generation.
BUILTIN_CATALOG: List[Dict[str, Any]] = []


def get_builtin_catalog() -> List[Dict[str, Any]]:
    """Return the list of built-in furniture items (currently empty)."""
    return BUILTIN_CATALOG


def get_builtin_item(item_id: str) -> Dict[str, Any] | None:
    """Get a single built-in item by ID."""
    for item in BUILTIN_CATALOG:
        if item["id"] == item_id:
            return item
    return None
