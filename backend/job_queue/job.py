"""
Job definition and queue management for reconstruction pipeline.
"""

import json
import logging
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Optional
from dataclasses import dataclass, asdict

try:
    import numpy as np
except ImportError:
    np = None

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    """Reconstruction job lifecycle."""
    PENDING = "pending"
    UPLOADING = "uploading"
    VALIDATING = "validating"
    PREPROCESSING = "preprocessing"
    FEATURE_MATCHING = "feature_matching"
    CAMERA_ESTIMATION = "camera_estimation"
    SPARSE_RECONSTRUCTION = "sparse_reconstruction"
    DENSE_RECONSTRUCTION = "dense_reconstruction"
    MESH_GENERATION = "mesh_generation"
    MESH_CLEANUP = "mesh_cleanup"
    TEXTURING = "texturing"
    OPTIMIZATION = "optimization"
    EXPORT = "export"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class JobProgress:
    """Track job progress through pipeline."""
    status: JobStatus
    progress_percent: float  # 0-100
    current_stage: str
    message: str
    error: Optional[str] = None
    timestamp: str = None

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now().isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status.value,
            "progress_percent": self.progress_percent,
            "current_stage": self.current_stage,
            "message": self.message,
            "error": self.error,
            "timestamp": self.timestamp,
        }


class ReconstructionJob:
    """
    Represents a multi-view furniture reconstruction job.
    """

    def __init__(
        self,
        job_id: str,
        item_id: str,
        image_paths: list[Path],
        output_dir: Path,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.job_id = job_id
        self.item_id = item_id
        self.image_paths = image_paths
        self.output_dir = output_dir
        self.metadata = metadata or {}
        
        self.created_at = datetime.now().isoformat()
        self.started_at = None
        self.completed_at = None
        
        self.status = JobStatus.PENDING
        self.progress = 0.0  # 0-100
        self.current_stage = "pending"
        self.message = "Job queued"
        self.error = None

        # Intermediate outputs
        self.processed_images: list[Path] = []
        self.masks: list[Path] = []
        self.sparse_cloud_path: Optional[Path] = None
        self.dense_cloud_path: Optional[Path] = None
        self.mesh_path: Optional[Path] = None
        self.textured_mesh_path: Optional[Path] = None
        self.optimized_mesh_path: Optional[Path] = None
        self.final_glb_path: Optional[Path] = None
        
        # Reconstruction data
        self.cameras: Optional[Dict[str, Any]] = None
        self.sparse_points: Optional[np.ndarray] = None
        self.dense_points: Optional[np.ndarray] = None

    def update_progress(
        self,
        status: JobStatus,
        progress_percent: float,
        message: str,
        error: Optional[str] = None,
    ) -> None:
        """Update job progress."""
        self.status = status
        self.progress = max(0, min(100, progress_percent))
        self.current_stage = status.value
        self.message = message
        self.error = error

        if self.started_at is None and status != JobStatus.PENDING:
            self.started_at = datetime.now().isoformat()

        if status in (JobStatus.COMPLETED, JobStatus.FAILED):
            self.completed_at = datetime.now().isoformat()

        logger.info(
            f"Job {self.job_id}: {status.value} ({progress_percent}%) - {message}"
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize job to dict."""
        return {
            "job_id": self.job_id,
            "item_id": self.item_id,
            "status": self.status.value,
            "progress_percent": self.progress,
            "current_stage": self.current_stage,
            "message": self.message,
            "error": self.error,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "image_count": len(self.image_paths),
            "final_glb_path": str(self.final_glb_path) if self.final_glb_path else None,
            "metadata": self.metadata,
        }

    def save_state(self, state_file: Path) -> None:
        """Save job state to JSON for persistence."""
        state_file.parent.mkdir(parents=True, exist_ok=True)
        with open(state_file, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load_state(cls, state_file: Path, output_dir: Path) -> "ReconstructionJob":
        """Load job state from JSON."""
        with open(state_file, "r") as f:
            data = json.load(f)
        
        job = cls(
            job_id=data["job_id"],
            item_id=data["item_id"],
            image_paths=[],  # Will be reconstructed
            output_dir=output_dir,
            metadata=data.get("metadata", {}),
        )
        
        job.status = JobStatus(data["status"])
        job.progress = data["progress_percent"]
        job.current_stage = data["current_stage"]
        job.message = data["message"]
        job.error = data["error"]
        job.created_at = data["created_at"]
        job.started_at = data["started_at"]
        job.completed_at = data["completed_at"]
        
        if data["final_glb_path"]:
            job.final_glb_path = Path(data["final_glb_path"])
        
        return job


class JobQueue:
    """In-memory job queue with persistence."""

    def __init__(self, queue_dir: Path):
        self.queue_dir = queue_dir
        self.queue_dir.mkdir(parents=True, exist_ok=True)
        self.jobs: Dict[str, ReconstructionJob] = {}

    def add_job(self, job: ReconstructionJob) -> None:
        """Add job to queue."""
        self.jobs[job.job_id] = job
        job.save_state(self.queue_dir / f"{job.job_id}.json")
        logger.info(f"Job {job.job_id} added to queue")

    def get_job(self, job_id: str) -> Optional[ReconstructionJob]:
        """Get job by ID."""
        return self.jobs.get(job_id)

    def remove_job(self, job_id: str) -> None:
        """Remove job from queue."""
        if job_id in self.jobs:
            del self.jobs[job_id]
            state_file = self.queue_dir / f"{job_id}.json"
            if state_file.exists():
                state_file.unlink()

    def get_pending_jobs(self) -> list[ReconstructionJob]:
        """Get all pending jobs."""
        return [j for j in self.jobs.values() if j.status == JobStatus.PENDING]

    def get_all_jobs(self) -> list[ReconstructionJob]:
        """Get all jobs."""
        return list(self.jobs.values())
