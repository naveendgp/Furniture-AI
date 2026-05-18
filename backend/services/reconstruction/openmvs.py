"""
OpenMVS wrapper for dense reconstruction and mesh generation.
"""

import logging
import subprocess
import os
import shutil
from pathlib import Path
from typing import Tuple, Optional
import numpy as np

logger = logging.getLogger(__name__)


class OpenMVSPipeline:
    """
    Wrapper around OpenMVS for dense reconstruction and mesh generation.
    
    OpenMVS steps:
    1. Convert COLMAP output to OpenMVS MVS format
    2. Dense point cloud generation
    3. Mesh reconstruction
    4. Mesh refinement
    """
    
    def __init__(self, openmvs_bin: Optional[Path] = None):
        """
        Initialize OpenMVS pipeline.
        
        Args:
            openmvs_bin: Path to OpenMVS binary directory. If None, assume tools are in PATH.
        """
        self.openmvs_bin = openmvs_bin
        self.tools = self._resolve_openmvs_tools(openmvs_bin)

    @staticmethod
    def _resolve_openmvs_tools(openmvs_bin: Optional[Path]) -> dict:
        """Resolve OpenMVS tool executables from explicit path, env vars, or PATH."""
        tool_names = ["DensifyPointCloud", "ReconstructMesh", "RefineMesh", "colmap2mvs"]
        resolved = {}

        def find_tool(name: str) -> str:
            # Constructor arg path
            if openmvs_bin:
                if openmvs_bin.is_file() and openmvs_bin.stem.lower() == name.lower():
                    return str(openmvs_bin)
                candidate = openmvs_bin / f"{name}.exe"
                if candidate.exists():
                    return str(candidate)

            # Env var directory
            env_bin = os.getenv("OPENMVS_BIN")
            if env_bin:
                candidate = Path(env_bin) / f"{name}.exe"
                if candidate.exists():
                    return str(candidate)

            # PATH lookup
            which = shutil.which(name) or shutil.which(f"{name}.exe")
            if which:
                return which

            return name

        for tool in tool_names:
            resolved[tool] = find_tool(tool)

        return resolved
    
    def colmap_to_mvs(
        self,
        colmap_model_dir: Path,
        mvs_dir: Path,
    ) -> bool:
        """
        Convert COLMAP model to OpenMVS MVS format.
        
        Args:
            colmap_model_dir: COLMAP sparse model directory
            mvs_dir: Output MVS directory
        
        Returns:
            True if successful
        """
        logger.info("OpenMVS: Converting COLMAP model to MVS format")
        
        mvs_dir.mkdir(parents=True, exist_ok=True)
        mvs_file = mvs_dir / "scene.mvs"
        
        cmd = [
            self.tools["colmap2mvs"],
            str(colmap_model_dir),
            "--output_path", str(mvs_file),
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if result.returncode != 0:
                logger.warning(f"colmap2mvs conversion warning: {result.stderr}")
                # Still try to continue - might have generated output
            
            if mvs_file.exists():
                logger.info(f"MVS file created: {mvs_file}")
                return True
            else:
                logger.error(f"MVS file not created: {mvs_file}")
                return False
                
        except FileNotFoundError:
            logger.error("colmap2mvs not found in PATH")
            return False
        except subprocess.TimeoutExpired:
            logger.error("colmap2mvs timed out")
            return False
        except Exception as e:
            logger.error(f"colmap2mvs error: {e}")
            return False
    
    def dense_reconstruction(
        self,
        mvs_file: Path,
        output_dir: Path,
    ) -> Tuple[bool, Optional[Path]]:
        """
        Generate dense point cloud from MVS data.
        
        Args:
            mvs_file: Input MVS file
            output_dir: Output directory
        
        Returns:
            (success, output_mvs_path)
        """
        logger.info("OpenMVS: Dense reconstruction")
        
        output_dir.mkdir(parents=True, exist_ok=True)
        output_mvs = output_dir / "dense.mvs"
        
        # Copy MVS file to output
        import shutil
        shutil.copy(mvs_file, output_mvs)
        
        cmd = [
            self.tools["DensifyPointCloud"],
            str(output_mvs),
            "--output_type", "glb",  # Output as glb
            "--working_folder", str(output_dir),
            "--resolution_level", "1",  # Quality level
            "--number_views_fuse", "3",  # Min views for fusion
            "--verbosity", "info",
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
            
            if result.returncode != 0:
                logger.warning(f"DensifyPointCloud warning: {result.stderr}")
            
            # Check for output
            if output_mvs.exists():
                logger.info(f"Dense reconstruction completed: {output_mvs}")
                return True, output_mvs
            else:
                logger.error("Dense reconstruction did not produce output")
                return False, None
                
        except FileNotFoundError:
            logger.error("DensifyPointCloud not found in PATH")
            return False, None
        except subprocess.TimeoutExpired:
            logger.error("DensifyPointCloud timed out")
            return False, None
        except Exception as e:
            logger.error(f"DensifyPointCloud error: {e}")
            return False, None
    
    def mesh_reconstruction(
        self,
        mvs_file: Path,
        output_dir: Path,
        use_cuda: bool = True,
    ) -> Tuple[bool, Optional[Path]]:
        """
        Reconstruct mesh from dense point cloud.
        
        Args:
            mvs_file: Input MVS file with dense points
            output_dir: Output directory
            use_cuda: Use CUDA acceleration if available
        
        Returns:
            (success, mesh_path)
        """
        logger.info("OpenMVS: Mesh reconstruction")
        
        output_dir.mkdir(parents=True, exist_ok=True)
        output_mvs = output_dir / "mesh.mvs"
        
        import shutil
        shutil.copy(mvs_file, output_mvs)
        
        cmd = [
            self.tools["ReconstructMesh"],
            str(output_mvs),
            "--output_type", "glb",
            "--working_folder", str(output_dir),
            "--verbosity", "info",
        ]
        
        if use_cuda:
            cmd.extend(["--use_cuda", "1"])
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
            
            if result.returncode != 0:
                logger.warning(f"ReconstructMesh warning: {result.stderr}")
            
            # Find output mesh
            mesh_candidates = list(output_dir.glob("*.ply"))
            if mesh_candidates:
                mesh_path = mesh_candidates[0]
                logger.info(f"Mesh created: {mesh_path}")
                return True, mesh_path
            
            logger.error("Mesh reconstruction did not produce output")
            return False, None
                
        except FileNotFoundError:
            logger.error("ReconstructMesh not found in PATH")
            return False, None
        except subprocess.TimeoutExpired:
            logger.error("ReconstructMesh timed out")
            return False, None
        except Exception as e:
            logger.error(f"ReconstructMesh error: {e}")
            return False, None
    
    def mesh_refinement(
        self,
        mesh_mvs: Path,
        output_dir: Path,
    ) -> Tuple[bool, Optional[Path]]:
        """
        Refine mesh: hole filling, normal estimation, smoothing.
        
        Args:
            mesh_mvs: Input MVS file with mesh
            output_dir: Output directory
        
        Returns:
            (success, refined_mesh_path)
        """
        logger.info("OpenMVS: Mesh refinement")
        
        output_dir.mkdir(parents=True, exist_ok=True)
        output_mvs = output_dir / "refined.mvs"
        
        import shutil
        shutil.copy(mesh_mvs, output_mvs)
        
        cmd = [
            self.tools["RefineMesh"],
            str(output_mvs),
            "--output_type", "glb",
            "--working_folder", str(output_dir),
            "--close_holes", "30",  # Max hole size
            "--smooth", "1",  # Smoothing iterations
            "--verbosity", "info",
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
            
            if result.returncode != 0:
                logger.warning(f"RefineMesh warning: {result.stderr}")
            
            # Find refined mesh
            mesh_candidates = list(output_dir.glob("*.ply"))
            if mesh_candidates:
                # Get most recent
                mesh_path = sorted(mesh_candidates, key=lambda p: p.stat().st_mtime)[-1]
                logger.info(f"Refined mesh: {mesh_path}")
                return True, mesh_path
            
            logger.warning("Mesh refinement did not produce output, continuing")
            return True, None
                
        except FileNotFoundError:
            logger.error("RefineMesh not found in PATH")
            return False, None
        except subprocess.TimeoutExpired:
            logger.error("RefineMesh timed out")
            return False, None
        except Exception as e:
            logger.error(f"RefineMesh error: {e}")
            return False, None
    
    def full_pipeline(
        self,
        colmap_model_dir: Path,
        image_dir: Path,
        output_dir: Path,
        use_cuda: bool = True,
    ) -> Tuple[bool, Optional[Path]]:
        """
        Run complete OpenMVS pipeline.
        
        Args:
            colmap_model_dir: COLMAP sparse model directory
            image_dir: Original images directory
            output_dir: Output directory for final mesh
            use_cuda: Use CUDA acceleration
        
        Returns:
            (success, final_mesh_path)
        """
        logger.info("Starting OpenMVS full pipeline")
        
        workspace = output_dir / "workspace"
        workspace.mkdir(parents=True, exist_ok=True)
        
        # Step 1: Convert COLMAP to MVS
        if not self.colmap_to_mvs(colmap_model_dir, workspace):
            logger.error("COLMAP to MVS conversion failed")
            return False, None
        
        mvs_file = workspace / "scene.mvs"
        if not mvs_file.exists():
            logger.error(f"MVS file not created: {mvs_file}")
            return False, None
        
        # Step 2: Dense reconstruction
        success, dense_mvs = self.dense_reconstruction(mvs_file, workspace)
        if not success:
            logger.warning("Dense reconstruction failed, trying mesh reconstruction directly")
            dense_mvs = mvs_file
        
        # Step 3: Mesh reconstruction
        success, mesh_path = self.mesh_reconstruction(
            dense_mvs or mvs_file,
            workspace,
            use_cuda=use_cuda
        )
        if not success:
            logger.error("Mesh reconstruction failed")
            return False, None
        
        # Step 4: Mesh refinement
        if mesh_path:
            success, refined_mesh = self.mesh_refinement(
                workspace / "mesh.mvs",
                workspace
            )
            if success and refined_mesh:
                mesh_path = refined_mesh
        
        if mesh_path and mesh_path.exists():
            logger.info(f"OpenMVS pipeline completed. Mesh: {mesh_path}")
            return True, mesh_path
        
        logger.error("OpenMVS pipeline failed to produce output")
        return False, None


def check_openmvs_installed() -> bool:
    """Check if OpenMVS tools are installed."""
    try:
        exe = OpenMVSPipeline._resolve_openmvs_tools(None)["DensifyPointCloud"]
        result = subprocess.run([exe, "--help"], capture_output=True, text=True)
        return result.returncode == 0
    except (FileNotFoundError, OSError):
        return False
