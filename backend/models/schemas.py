"""Pydantic schemas for API request/response models."""

from pydantic import BaseModel, Field
from typing import Optional, List, Tuple
from datetime import datetime


class FurnitureItem(BaseModel):
    """Schema for a stored furniture asset."""
    id: str
    name: str
    category: str
    width: float
    height: float
    depth: float
    original_image: str = ""
    processed_image: str = ""
    angle_images: list = []
    sprite_sheet: Optional[str] = None
    angle_count: int = 0
    model_url: str = ""
    thumbnail: str = ""
    builtin: bool = False
    generation_status: str = ""
    created_at: str = ""


class FurnitureListResponse(BaseModel):
    items: List[FurnitureItem]
    total: int


class SuggestedPlacement(BaseModel):
    position: Tuple[float, float, float]
    label: str


class RoomAnalysisResult(BaseModel):
    id: str
    image_path: str
    depth_map_path: str
    floor_mask_path: str = ""
    floor_polygon: List[Tuple[float, float]] = []
    room_width_cm: float = 0.0
    room_depth_cm: float = 0.0
    floor_y: float = Field(default=-1.5)
    perspective_fov: float = Field(default=60.0)
    vanishing_point: Tuple[float, float] = Field(default=(0.5, 0.35))
    camera_position: Tuple[float, float, float] = Field(default=(0, 1.5, 4))
    camera_rotation: Tuple[float, float, float] = Field(default=(-0.2, 0, 0))
    suggested_placements: List[SuggestedPlacement] = []
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    created_at: str = ""


class RoomUploadResponse(BaseModel):
    id: str
    image_path: str
    depth_map_path: str
    floor_mask_path: str = ""
    floor_polygon: List[Tuple[float, float]] = []
    room_width_cm: float = 0.0
    room_depth_cm: float = 0.0
    floor_y: float
    perspective_fov: float
    vanishing_point: Tuple[float, float]
    camera_position: Tuple[float, float, float] = (0, 1.5, 4)
    camera_rotation: Tuple[float, float, float] = (-0.2, 0, 0)
    suggested_placements: List[SuggestedPlacement] = []
    confidence: float


class FloorAdjustment(BaseModel):
    floor_y: Optional[float] = None
    perspective_fov: Optional[float] = None
    vanishing_point: Optional[Tuple[float, float]] = None


class ReconstructionStep(BaseModel):
    """A single step in the reconstruction pipeline."""
    name: str
    status: str = "pending"  # pending | processing | completed | skipped | failed


class ReconstructionStatus(BaseModel):
    """Status of a multi-view 3D reconstruction job."""
    status: str = "pending"  # pending | processing | completed | failed
    steps: List[ReconstructionStep] = []
    model_url: str = ""
    mesh_vertices: int = 0
    mesh_faces: int = 0
    file_size_bytes: int = 0
    processing_time_seconds: float = 0
    error: str = ""


class ImageValidationResult(BaseModel):
    """Result of validating a single uploaded image."""
    index: int
    angle: str
    sharpness_passed: bool = True
    sharpness_score: float = 0
    visibility_passed: bool = True
    message: str = ""


class MultiViewValidationResult(BaseModel):
    """Result of validating all uploaded images."""
    overall_passed: bool
    images: List[ImageValidationResult] = []
    lighting_consistent: bool = True
    coverage_score: float = 0
    missing_angles: List[str] = []
    warnings: List[str] = []
    message: str = ""

