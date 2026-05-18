"""
Main reconstruction orchestrator - coordinates the complete pipeline.
"""

import logging
from pathlib import Path
from typing import Optional, Tuple
import asyncio

from job_queue import ReconstructionJob, JobStatus
from services.image_validation import preprocess_images, assess_image_set
from services.background_removal import remove_background
from services.reconstruction import COLMAPPipeline, OpenMVSPipeline
from services.meshing import center_and_scale_mesh, get_mesh_stats
from services.optimization import export_to_glb, validate_glb, create_preview_glb

logger = logging.getLogger(__name__)


class ReconstructionOrchestrator:
    """
    Orchestrates the complete multi-view reconstruction pipeline:
    1. Image validation & preprocessing
    2. Background removal
    3. COLMAP camera pose estimation
    4. OpenMVS dense reconstruction
    5. Mesh generation & cleanup
    6. GLB export & optimization
    """
    
    def __init__(
        self,
        colmap_bin: Optional[Path] = None,
        openmvs_bin: Optional[Path] = None,
    ):
        self.colmap = COLMAPPipeline(colmap_bin)
        self.openmvs = OpenMVSPipeline(openmvs_bin)
    
    async def run_reconstruction(self, job: ReconstructionJob) -> bool:
        """
        Run complete reconstruction pipeline for a job.
        
        Args:
            job: ReconstructionJob instance
        
        Returns:
            True if successful
        """
        try:
            logger.info(f"Starting reconstruction pipeline for job {job.job_id}")
            
            # Step 1: Image validation
            if not await self._validate_images(job):
                return False
            
            # Step 2: Preprocessing
            if not await self._preprocess_images(job):
                return False
            
            # Step 3: Background removal
            if not await self._remove_backgrounds(job):
                return False
            
            # Step 4: COLMAP camera estimation
            if not await self._run_colmap(job):
                return False
            
            # Step 5: OpenMVS dense reconstruction
            if not await self._run_openmvs(job):
                return False
            
            # Step 6: Mesh cleanup
            if not await self._cleanup_mesh(job):
                return False
            
            # Step 7: GLB export
            if not await self._export_glb(job):
                return False
            
            job.update_progress(
                JobStatus.COMPLETED,
                100,
                "Reconstruction completed successfully",
            )
            job.save_state(job.output_dir / f"{job.job_id}.json")
            logger.info(f"Reconstruction completed for job {job.job_id}")
            return True
            
        except Exception as e:
            logger.error(f"Reconstruction failed: {e}")
            job.update_progress(
                JobStatus.FAILED,
                job.progress,
                f"Reconstruction failed: {str(e)}",
                error=str(e),
            )
            job.save_state(job.output_dir / f"{job.job_id}.json")
            return False
    
    async def _validate_images(self, job: ReconstructionJob) -> bool:
        """Validate input images."""
        job.update_progress(
            JobStatus.VALIDATING,
            5,
            "Validating input images",
        )
        
        is_valid, quality_map, warnings = assess_image_set(job.image_paths)
        
        if not is_valid:
            error_msg = "Image validation failed: " + "; ".join(warnings[:3])
            job.update_progress(JobStatus.FAILED, 5, error_msg, error=error_msg)
            return False
        
        if warnings:
            logger.warning(f"Image validation warnings: {warnings}")
        
        logger.info(f"Image validation passed: {len(job.image_paths)} images")
        return True
    
    async def _preprocess_images(self, job: ReconstructionJob) -> bool:
        """Preprocess images."""
        job.update_progress(
            JobStatus.PREPROCESSING,
            10,
            "Preprocessing images",
        )
        
        preprocess_dir = job.output_dir / "preprocessed"
        processed_paths = preprocess_images(job.image_paths, preprocess_dir)
        
        if len(processed_paths) < 5:
            error_msg = f"Preprocessing failed: only {len(processed_paths)} images processed"
            job.update_progress(JobStatus.FAILED, 10, error_msg, error=error_msg)
            return False
        
        job.processed_images = processed_paths
        return True
    
    async def _remove_backgrounds(self, job: ReconstructionJob) -> bool:
        """Remove backgrounds from preprocessed images."""
        job.update_progress(
            JobStatus.PREPROCESSING,
            15,
            "Removing backgrounds",
        )
        
        masks_dir = job.output_dir / "masks"
        masks_dir.mkdir(parents=True, exist_ok=True)
        
        for i, image_path in enumerate(job.processed_images):
            output_path = masks_dir / f"mask_{i:03d}.png"
            try:
                remove_background(image_path, output_path)
                job.masks.append(output_path)
            except Exception as e:
                logger.warning(f"Background removal failed for {image_path.name}: {e}")
        
        if len(job.masks) < 5:
            error_msg = f"Background removal failed for {len(job.image_paths) - len(job.masks)} images"
            job.update_progress(JobStatus.FAILED, 15, error_msg, error=error_msg)
            return False
        
        return True
    
    async def _run_colmap(self, job: ReconstructionJob) -> bool:
        """Run COLMAP for camera pose estimation."""
        job.update_progress(
            JobStatus.FEATURE_MATCHING,
            20,
            "Running COLMAP feature extraction",
        )
        
        colmap_dir = job.output_dir / "colmap"
        
        success, sparse_model = self.colmap.full_pipeline(
            image_dir=Path(job.processed_images[0]).parent,
            output_dir=colmap_dir,
        )
        
        if not success or not sparse_model:
            error_msg = "COLMAP reconstruction failed"
            job.update_progress(JobStatus.FAILED, 50, error_msg, error=error_msg)
            return False
        
        job.update_progress(
            JobStatus.SPARSE_RECONSTRUCTION,
            50,
            "COLMAP sparse reconstruction completed",
        )
        
        # Load camera data
        job.cameras = self.colmap.load_cameras(sparse_model)
        job.sparse_points = self.colmap.load_points3d(sparse_model)
        
        logger.info(f"COLMAP completed: {len(job.cameras)} cameras, {len(job.sparse_points)} 3D points")
        return True
    
    async def _run_openmvs(self, job: ReconstructionJob) -> bool:
        """Run OpenMVS for dense reconstruction and meshing."""
        job.update_progress(
            JobStatus.DENSE_RECONSTRUCTION,
            60,
            "Running OpenMVS dense reconstruction",
        )
        
        openmvs_dir = job.output_dir / "openmvs"
        colmap_model = job.output_dir / "colmap" / "0"
        
        success, mesh_path = self.openmvs.full_pipeline(
            colmap_model_dir=colmap_model,
            image_dir=Path(job.processed_images[0]).parent,
            output_dir=openmvs_dir,
        )
        
        if not success or not mesh_path:
            error_msg = "OpenMVS dense reconstruction failed"
            job.update_progress(JobStatus.FAILED, 70, error_msg, error=error_msg)
            return False
        
        job.mesh_path = mesh_path
        
        job.update_progress(
            JobStatus.MESH_GENERATION,
            75,
            "Mesh generation completed",
        )
        return True
    
    async def _cleanup_mesh(self, job: ReconstructionJob) -> bool:
        """Clean and optimize mesh."""
        job.update_progress(
            JobStatus.MESH_CLEANUP,
            80,
            "Cleaning up mesh",
        )
        
        if not job.mesh_path or not job.mesh_path.exists():
            error_msg = "Mesh file not found"
            job.update_progress(JobStatus.FAILED, 80, error_msg, error=error_msg)
            return False
        
        cleanup_dir = job.output_dir / "cleanup"
        cleanup_dir.mkdir(parents=True, exist_ok=True)
        
        # Center and scale mesh
        centered_mesh = cleanup_dir / "centered.ply"
        center_and_scale_mesh(
            job.mesh_path,
            centered_mesh,
            scale=1.0,
        )
        
        job.mesh_path = centered_mesh
        return True
    
    async def _export_glb(self, job: ReconstructionJob) -> bool:
        """Export mesh to GLB format."""
        job.update_progress(
            JobStatus.EXPORT,
            90,
            "Exporting to GLB format",
        )
        
        if not job.mesh_path or not job.mesh_path.exists():
            error_msg = "Mesh file not found for GLB export"
            job.update_progress(JobStatus.FAILED, 90, error_msg, error=error_msg)
            return False
        
        # Export main GLB
        final_glb = job.output_dir / "furniture.glb"
        if not export_to_glb(job.mesh_path, final_glb, scale=1.0, center=True):
            error_msg = "GLB export failed"
            job.update_progress(JobStatus.FAILED, 90, error_msg, error=error_msg)
            return False
        
        # Validate
        if not validate_glb(final_glb):
            error_msg = "GLB validation failed"
            job.update_progress(JobStatus.FAILED, 95, error_msg, error=error_msg)
            return False
        
        # Create preview
        preview_glb = job.output_dir / "furniture_preview.glb"
        create_preview_glb(job.mesh_path, preview_glb, max_triangles=50000)
        
        job.final_glb_path = final_glb
        
        # Get stats
        stats = get_mesh_stats(final_glb)
        logger.info(f"Final GLB stats: {stats}")
        
        return True


async def run_reconstruction_job(job: ReconstructionJob) -> bool:
    """Helper function to run reconstruction job."""
    orchestrator = ReconstructionOrchestrator()
    return await orchestrator.run_reconstruction(job)
