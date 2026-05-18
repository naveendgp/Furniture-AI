"""
Multi-view furniture reconstruction API endpoints.
"""

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import List
import asyncio
import uuid

from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from pydantic import BaseModel

from job_queue import ReconstructionJob, JobStatus, JobQueue
from services.image_validation import assess_image_set, ImageQuality
from services.orchestrator import run_reconstruction_job
from services.reconstruction import (
    check_colmap_installed,
    check_openmvs_installed,
    COLMAPPipeline,
    OpenMVSPipeline,
)
from utils.storage import FURNITURE_DB, add_item, generate_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/multiview", tags=["multiview-reconstruction"])

# Shared job queue
job_queue = JobQueue(Path("job_queue"))

# Upload directory
MULTIVIEW_UPLOADS = Path(__file__).resolve().parent.parent / "uploads" / "multiview"
MULTIVIEW_UPLOADS.mkdir(parents=True, exist_ok=True)


def _public_path(path: Path) -> str:
    """Convert a backend file path into a public /uploads URL."""
    backend_root = Path(__file__).resolve().parent.parent
    return "/" + path.relative_to(backend_root).as_posix()


# Pydantic models
class ImageQualityResponse(BaseModel):
    """Image quality assessment response."""
    filename: str
    sharpness: float
    brightness: float
    contrast: float
    blur_score: float
    is_valid: bool
    issues: List[str]


class UploadValidationResponse(BaseModel):
    """Validation response for image upload."""
    upload_id: str
    valid_images: int
    total_images: int
    is_valid: bool
    warnings: List[str]
    quality_details: List[ImageQualityResponse]


class JobStatusResponse(BaseModel):
    """Job status response."""
    job_id: str
    item_id: str
    status: str
    progress_percent: float
    current_stage: str
    message: str
    error: str | None
    created_at: str
    final_glb_url: str | None


class ReconstructionResponse(BaseModel):
    """Reconstruction result response."""
    job_id: str
    success: bool
    glb_url: str | None
    message: str
    stats: dict | None


@router.post("/validate-upload")
async def validate_upload(
    images: List[UploadFile] = File(...),
):
    """
    Validate a batch of furniture images before reconstruction.
    
    Returns:
        - Number of valid images
        - Quality metrics for each
        - Recommendations
    """
    if len(images) < 5:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least 5 images, got {len(images)}"
        )
    
    if len(images) > 100:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum 100 images, got {len(images)}"
        )
    
    logger.info(f"Validating {len(images)} images")
    
    # Save images temporarily
    upload_id = str(uuid.uuid4())
    temp_dir = MULTIVIEW_UPLOADS / upload_id
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    image_paths = []
    for file in images:
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="All files must be images")
        
        content = await file.read()
        image_path = temp_dir / file.filename
        with open(image_path, "wb") as f:
            f.write(content)
        image_paths.append(image_path)
    
    # Validate
    is_valid, quality_map, warnings = assess_image_set(image_paths)
    
    # Build response
    quality_details = []
    valid_count = 0
    
    for path in image_paths:
        quality: ImageQuality = quality_map.get(str(path))
        if quality:
            if quality.is_valid:
                valid_count += 1
            quality_details.append(ImageQualityResponse(
                filename=path.name,
                sharpness=quality.sharpness,
                brightness=quality.brightness,
                contrast=quality.contrast,
                blur_score=quality.blur_score,
                is_valid=quality.is_valid,
                issues=quality.issues,
            ))
    
    logger.info(
        f"Upload validation: {valid_count}/{len(images)} valid, "
        f"{len(warnings)} warnings"
    )
    
    return UploadValidationResponse(
        upload_id=upload_id,
        valid_images=valid_count,
        total_images=len(images),
        is_valid=is_valid,
        warnings=warnings,
        quality_details=quality_details,
    )


@router.post("/reconstruct")
async def start_reconstruction(
    item_id: str = Form(...),
    name: str = Form(...),
    category: str = Form(...),
    upload_id: str = Form(...),
    images: List[UploadFile] = File(...),
):
    """
    Start multi-view furniture reconstruction.
    
    Returns:
        - Job ID for status tracking
        - Initial status
    """
    if len(images) < 5:
        raise HTTPException(status_code=400, detail="Minimum 5 images required")

    missing = []
    if not check_colmap_installed():
        missing.append("COLMAP")
    if not check_openmvs_installed():
        missing.append("OpenMVS")
    if missing:
        raise HTTPException(
            status_code=503,
            detail=(
                "Missing reconstruction dependencies: "
                + ", ".join(missing)
                + ". Install them and ensure binaries are available in PATH."
            ),
        )
    
    logger.info(f"Starting reconstruction job for {name}")
    
    # Create job ID and directory
    job_id = f"recon_{generate_id()}"
    job_dir = MULTIVIEW_UPLOADS / item_id / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    
    # Save images
    image_paths = []
    for file in images:
        content = await file.read()
        image_path = job_dir / "images" / file.filename
        image_path.parent.mkdir(parents=True, exist_ok=True)
        with open(image_path, "wb") as f:
            f.write(content)
        image_paths.append(image_path)
    
    # Create job
    job = ReconstructionJob(
        job_id=job_id,
        item_id=item_id,
        image_paths=image_paths,
        output_dir=job_dir,
        metadata={
            "name": name,
            "category": category,
            "image_count": len(image_paths),
        },
    )
    
    job_queue.add_job(job)
    
    async def _run_and_publish() -> None:
        success = await run_reconstruction_job(job)

        if not success or not job.final_glb_path or not job.final_glb_path.exists():
            return

        processed_image = _public_path(job.processed_images[0]) if job.processed_images else ""
        original_image = _public_path(job.image_paths[0]) if job.image_paths else ""

        add_item(FURNITURE_DB, {
            "id": item_id,
            "name": name,
            "category": category,
            "width": 100.0,
            "height": 100.0,
            "depth": 50.0,
            "original_image": original_image,
            "processed_image": processed_image,
            "angle_images": [],
            "sprite_sheet": None,
            "angle_count": 0,
            "model_url": _public_path(job.final_glb_path),
            "thumbnail": "",
            "builtin": False,
            "generation_status": "completed",
            "created_at": job.created_at,
        })

    # Start reconstruction in background
    asyncio.create_task(_run_and_publish())
    
    logger.info(f"Reconstruction job started: {job_id}")
    
    return JobStatusResponse(
        job_id=job_id,
        item_id=item_id,
        status=job.status.value,
        progress_percent=job.progress,
        current_stage=job.current_stage,
        message=job.message,
        error=None,
        created_at=job.created_at,
        final_glb_url=None,
    )


@router.get("/job/{job_id}")
async def get_job_status(job_id: str):
    """
    Get reconstruction job status and progress.
    """
    job = job_queue.get_job(job_id)
    
    if not job:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    
    glb_url = None
    if job.final_glb_path:
        # Convert to URL
        glb_url = str(job.final_glb_path).replace("\\", "/")
    
    return JobStatusResponse(
        job_id=job.job_id,
        item_id=job.item_id,
        status=job.status.value,
        progress_percent=job.progress,
        current_stage=job.current_stage,
        message=job.message,
        error=job.error,
        created_at=job.created_at,
        final_glb_url=glb_url,
    )


@router.get("/jobs")
async def list_jobs():
    """List all reconstruction jobs."""
    jobs = job_queue.get_all_jobs()
    
    return {
        "total": len(jobs),
        "jobs": [
            {
                "job_id": j.job_id,
                "item_id": j.item_id,
                "status": j.status.value,
                "progress_percent": j.progress,
                "image_count": len(j.image_paths),
                "created_at": j.created_at,
                "completed_at": j.completed_at,
            }
            for j in jobs
        ],
    }


@router.get("/health")
async def health_check():
    """Check if reconstruction pipeline components are available."""
    colmap_pipeline = COLMAPPipeline()
    openmvs_pipeline = OpenMVSPipeline()

    return {
        "colmap_available": check_colmap_installed(),
        "openmvs_available": check_openmvs_installed(),
        "colmap_exe": str(colmap_pipeline.colmap_exe),
        "openmvs_tools": openmvs_pipeline.tools,
        "env": {
            "COLMAP_EXE": os.getenv("COLMAP_EXE"),
            "COLMAP_BIN": os.getenv("COLMAP_BIN"),
            "OPENMVS_BIN": os.getenv("OPENMVS_BIN"),
        },
        "status": "ready",
    }
