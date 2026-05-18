"""
COLMAP wrapper for multi-view geometry and camera pose estimation.
"""

import logging
import subprocess
import json
import os
import shutil
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import numpy as np
import struct

logger = logging.getLogger(__name__)


class COLMAPPipeline:
    """
    Wrapper around COLMAP for camera pose estimation and sparse reconstruction.
    
    COLMAP steps:
    1. Feature extraction
    2. Feature matching
    3. Incremental SfM (structure-from-motion)
    4. Dense reconstruction (optional, use OpenMVS instead)
    """
    
    def __init__(self, colmap_bin: Optional[Path] = None):
        """
        Initialize COLMAP pipeline.
        
        Args:
            colmap_bin: Path to COLMAP binary directory. If None, assume colmap is in PATH.
        """
        self.colmap_bin = colmap_bin
        self.colmap_exe = self._resolve_colmap_exe(colmap_bin)

    @staticmethod
    def _resolve_colmap_exe(colmap_bin: Optional[Path]) -> str:
        """Resolve COLMAP executable from explicit path, env vars, or PATH."""
        # 1) Explicit constructor arg
        if colmap_bin:
            if colmap_bin.is_file():
                return str(colmap_bin)
            candidate = colmap_bin / "colmap.exe"
            if candidate.exists():
                return str(candidate)

        # 2) Full executable path via env var
        env_exe = os.getenv("COLMAP_EXE")
        if env_exe and Path(env_exe).exists():
            return env_exe

        # 3) Directory path via env var
        env_bin = os.getenv("COLMAP_BIN")
        if env_bin:
            candidate = Path(env_bin) / "colmap.exe"
            if candidate.exists():
                return str(candidate)

        # 4) PATH lookup
        which = shutil.which("colmap") or shutil.which("colmap.exe")
        if which:
            return which

        # Last resort; subprocess will error with a clear message
        return "colmap"
    
    def feature_extractor(
        self,
        database_path: Path,
        image_dir: Path,
        camera_model: str = "SIMPLE_PINHOLE",
    ) -> bool:
        """
        Extract features from images using COLMAP.
        
        Args:
            database_path: Path to COLMAP database file
            image_dir: Directory containing images
            camera_model: Camera model (SIMPLE_PINHOLE, PINHOLE, OPENCV, etc.)
        
        Returns:
            True if successful
        """
        logger.info(f"COLMAP: Feature extraction from {image_dir.name}")
        
        cmd = [
            str(self.colmap_exe),
            "feature_extractor",
            "--database_path", str(database_path),
            "--image_path", str(image_dir),
            "--ImageReader.camera_model", camera_model,
            "--ImageReader.single_camera", "1",  # All images from same camera
            "--SiftExtraction.upright", "0",  # Allow rotation
            "--SiftExtraction.first_octave", "-1",
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            if result.returncode != 0:
                logger.error(f"Feature extraction failed: {result.stderr}")
                return False
            logger.info("Feature extraction completed")
            return True
        except subprocess.TimeoutExpired:
            logger.error("Feature extraction timed out")
            return False
        except Exception as e:
            logger.error(f"Feature extraction error: {e}")
            return False
    
    def feature_matcher(
        self,
        database_path: Path,
        matcher_type: str = "sequential",
    ) -> bool:
        """
        Match features between images.
        
        Args:
            database_path: Path to COLMAP database
            matcher_type: "sequential" or "exhaustive"
        
        Returns:
            True if successful
        """
        logger.info(f"COLMAP: Feature matching ({matcher_type})")
        
        if matcher_type == "sequential":
            cmd = [
                str(self.colmap_exe),
                "sequential_matcher",
                "--database_path", str(database_path),
                "--SequentialMatching.overlap", "4",
                "--SequentialMatching.quadratic_overlap", "1",
            ]
        else:
            cmd = [
                str(self.colmap_exe),
                "exhaustive_matcher",
                "--database_path", str(database_path),
            ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=1200)
            if result.returncode != 0:
                logger.error(f"Feature matching failed: {result.stderr}")
                return False
            logger.info("Feature matching completed")
            return True
        except subprocess.TimeoutExpired:
            logger.error("Feature matching timed out")
            return False
        except Exception as e:
            logger.error(f"Feature matching error: {e}")
            return False
    
    def incremental_sfm(
        self,
        database_path: Path,
        output_dir: Path,
        image_dir: Path,
    ) -> bool:
        """
        Run incremental Structure-from-Motion.
        
        Args:
            database_path: Path to COLMAP database
            output_dir: Output directory for reconstruction
            image_dir: Directory containing images
        
        Returns:
            True if successful
        """
        logger.info("COLMAP: Incremental SfM")
        
        output_dir.mkdir(parents=True, exist_ok=True)
        
        cmd = [
            str(self.colmap_exe),
            "mapper",
            "--database_path", str(database_path),
            "--image_path", str(image_dir),
            "--output_path", str(output_dir),
            "--Mapper.min_model_size", "4",
            "--Mapper.init_min_tri_angle", "4",
            "--Mapper.multiple_models", "0",
            "--Mapper.extract_colors", "1",
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
            if result.returncode != 0:
                logger.error(f"SfM failed: {result.stderr}")
                return False
            logger.info("SfM completed")
            return True
        except subprocess.TimeoutExpired:
            logger.error("SfM timed out")
            return False
        except Exception as e:
            logger.error(f"SfM error: {e}")
            return False
    
    def full_pipeline(
        self,
        image_dir: Path,
        output_dir: Path,
        workspace_dir: Optional[Path] = None,
    ) -> Tuple[bool, Optional[Path]]:
        """
        Run complete COLMAP pipeline.
        
        Args:
            image_dir: Input images directory
            output_dir: Output reconstruction directory
            workspace_dir: Temporary workspace (defaults to output_dir/workspace)
        
        Returns:
            (success, sparse_model_dir)
        """
        if workspace_dir is None:
            workspace_dir = output_dir / "workspace"
        
        workspace_dir.mkdir(parents=True, exist_ok=True)
        database_path = workspace_dir / "database.db"
        
        # Remove old database if exists
        if database_path.exists():
            database_path.unlink()
        
        logger.info("Starting COLMAP full pipeline")
        
        # Step 1: Feature extraction
        if not self.feature_extractor(database_path, image_dir):
            logger.error("Feature extraction failed")
            return False, None
        
        # Step 2: Feature matching
        if not self.feature_matcher(database_path, matcher_type="sequential"):
            logger.error("Feature matching failed")
            return False, None
        
        # Step 3: Incremental SfM
        sparse_model_dir = output_dir / "0"
        if not self.incremental_sfm(database_path, output_dir, image_dir):
            logger.error("SfM failed")
            return False, None
        
        if not sparse_model_dir.exists():
            logger.error(f"SfM did not produce output in {sparse_model_dir}")
            return False, None
        
        logger.info(f"COLMAP pipeline completed. Sparse model: {sparse_model_dir}")
        return True, sparse_model_dir
    
    @staticmethod
    def load_cameras(model_dir: Path) -> Dict[str, Dict]:
        """
        Load camera models from COLMAP output.
        
        Args:
            model_dir: COLMAP model directory (contains cameras.bin)
        
        Returns:
            Dict of camera models
        """
        cameras_file = model_dir / "cameras.bin"
        
        if not cameras_file.exists():
            logger.warning(f"cameras.bin not found in {model_dir}")
            return {}
        
        cameras = {}
        with open(cameras_file, "rb") as f:
            num_cameras = struct.unpack("Q", f.read(8))[0]
            
            for i in range(num_cameras):
                camera_id = struct.unpack("I", f.read(4))[0]
                model = f.read(7).rstrip(b'\x00').decode('ascii')
                width, height = struct.unpack("II", f.read(8))
                params = struct.unpack("d" * 4, f.read(32))
                
                cameras[str(camera_id)] = {
                    "id": camera_id,
                    "model": model,
                    "width": width,
                    "height": height,
                    "params": params,
                }
        
        logger.info(f"Loaded {len(cameras)} camera models")
        return cameras
    
    @staticmethod
    def load_images(model_dir: Path) -> Dict[str, Dict]:
        """
        Load image metadata from COLMAP output.
        
        Args:
            model_dir: COLMAP model directory (contains images.bin)
        
        Returns:
            Dict of image metadata
        """
        images_file = model_dir / "images.bin"
        
        if not images_file.exists():
            logger.warning(f"images.bin not found in {model_dir}")
            return {}
        
        images = {}
        with open(images_file, "rb") as f:
            num_images = struct.unpack("Q", f.read(8))[0]
            
            for i in range(num_images):
                image_id = struct.unpack("I", f.read(4))[0]
                qw, qx, qy, qz = struct.unpack("dddd", f.read(32))
                tx, ty, tz = struct.unpack("ddd", f.read(24))
                camera_id = struct.unpack("I", f.read(4))[0]
                
                name_len = struct.unpack("I", f.read(4))[0]
                name = f.read(name_len).decode('utf-8')
                
                # Skip point3D data
                num_points2d = struct.unpack("Q", f.read(8))[0]
                f.read(num_points2d * 20)  # Each point2D: 2*double + uint64
                
                images[str(image_id)] = {
                    "id": image_id,
                    "name": name,
                    "camera_id": camera_id,
                    "qw": qw, "qx": qx, "qy": qy, "qz": qz,
                    "tx": tx, "ty": ty, "tz": tz,
                }
        
        logger.info(f"Loaded {len(images)} image poses")
        return images
    
    @staticmethod
    def load_points3d(model_dir: Path) -> np.ndarray:
        """
        Load sparse point cloud from COLMAP output.
        
        Args:
            model_dir: COLMAP model directory (contains points3D.bin)
        
        Returns:
            Array of shape (N, 3) with 3D point coordinates
        """
        points_file = model_dir / "points3D.bin"
        
        if not points_file.exists():
            logger.warning(f"points3D.bin not found in {model_dir}")
            return np.array([])
        
        points = []
        with open(points_file, "rb") as f:
            num_points = struct.unpack("Q", f.read(8))[0]
            
            for i in range(num_points):
                point_id = struct.unpack("Q", f.read(8))[0]
                x, y, z = struct.unpack("ddd", f.read(24))
                r, g, b = struct.unpack("BBB", f.read(3))
                error = struct.unpack("d", f.read(8))[0]
                
                track_len = struct.unpack("Q", f.read(8))[0]
                f.read(track_len * 16)  # Skip track data
                
                points.append([x, y, z])
        
        logger.info(f"Loaded {len(points)} 3D points")
        return np.array(points)


def check_colmap_installed() -> bool:
    """Check if COLMAP is installed and accessible."""
    try:
        exe = COLMAPPipeline._resolve_colmap_exe(None)
        result = subprocess.run([exe, "--version"], capture_output=True, text=True)
        return result.returncode == 0
    except (FileNotFoundError, OSError):
        return False
