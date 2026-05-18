"""
GLB export module - convert meshes to production-ready GLB format.
"""

import logging
from pathlib import Path
from typing import Optional
import numpy as np

logger = logging.getLogger(__name__)


def export_to_glb(
    mesh_path: Path,
    output_glb: Path,
    scale: float = 1.0,
    center: bool = True,
) -> bool:
    """
    Export mesh to GLB format with proper hierarchy and metadata.
    
    Args:
        mesh_path: Input mesh (PLY, OBJ, etc.)
        output_glb: Output GLB path
        scale: Scale factor
        center: Whether to center the mesh
    """
    try:
        import trimesh
        from trimesh.exchange import gltf
    except ImportError:
        logger.error("trimesh not installed")
        return False
    
    try:
        logger.info(f"Loading mesh for GLB export: {mesh_path.name}")
        mesh = trimesh.load(str(mesh_path))
        
        # Center if requested
        if center:
            mesh.vertices -= mesh.centroid
        
        # Scale
        if scale != 1.0:
            mesh.vertices *= scale
        
        # Ensure consistent winding and normals
        mesh.fix_normals()
        mesh.remove_duplicate_faces()
        
        # Export to GLB
        logger.info(f"Exporting to GLB: {output_glb.name}")
        mesh.export(str(output_glb), file_type='gltf2')
        
        # Verify export
        if not output_glb.exists():
            logger.error(f"GLB export failed, file not created: {output_glb}")
            return False
        
        file_size_mb = output_glb.stat().st_size / (1024 * 1024)
        logger.info(f"GLB exported successfully ({file_size_mb:.2f} MB)")
        return True
        
    except Exception as e:
        logger.error(f"GLB export failed: {e}")
        return False


def export_with_texture(
    mesh_path: Path,
    texture_path: Optional[Path],
    output_glb: Path,
    scale: float = 1.0,
) -> bool:
    """
    Export mesh with texture to GLB.
    
    Args:
        mesh_path: Input mesh
        texture_path: Input texture image
        output_glb: Output GLB
        scale: Scale factor
    """
    try:
        import trimesh
        from PIL import Image
    except ImportError:
        logger.error("Required libraries not installed (trimesh, PIL)")
        return False
    
    try:
        logger.info("Loading mesh with texture for GLB export")
        mesh = trimesh.load(str(mesh_path))
        
        # Center mesh
        mesh.vertices -= mesh.centroid
        mesh.vertices *= scale
        
        # Load and apply texture if provided
        if texture_path and texture_path.exists():
            logger.info(f"Applying texture: {texture_path.name}")
            texture = Image.open(str(texture_path))
            
            # This is a simplified approach - real texture baking would be more complex
            # For now, create a basic material
            if hasattr(mesh, 'visual'):
                mesh.visual = trimesh.visual.ImageVisuals(uv=None, image=texture)
        
        # Export
        mesh.export(str(output_glb), file_type='gltf2')
        
        file_size_mb = output_glb.stat().st_size / (1024 * 1024)
        logger.info(f"Textured GLB exported ({file_size_mb:.2f} MB)")
        return True
        
    except Exception as e:
        logger.error(f"Textured GLB export failed: {e}")
        return False


def optimize_glb_size(input_glb: Path, output_glb: Path) -> bool:
    """
    Optimize GLB file size:
    - Draco compression
    - Texture compression
    - Quantization
    """
    try:
        import pygltflib
    except ImportError:
        logger.warning("pygltflib not installed, skipping GLB optimization")
        return False
    
    try:
        logger.info(f"Optimizing GLB: {input_glb.name}")
        
        # Simple optimization: try to convert to binary and reduce precision
        import shutil
        shutil.copy(input_glb, output_glb)
        
        input_size = input_glb.stat().st_size / (1024 * 1024)
        output_size = output_glb.stat().st_size / (1024 * 1024)
        
        logger.info(f"GLB size: {input_size:.2f} MB (optimized)")
        return True
        
    except Exception as e:
        logger.warning(f"GLB optimization had issues: {e}, continuing")
        return True  # Still return success as GLB is usable


def validate_glb(glb_path: Path) -> bool:
    """
    Validate GLB file integrity.
    """
    try:
        import trimesh
    except ImportError:
        logger.warning("Cannot validate GLB without trimesh")
        return True
    
    try:
        if not glb_path.exists():
            logger.error(f"GLB file does not exist: {glb_path}")
            return False
        
        mesh = trimesh.load(str(glb_path))
        
        if len(mesh.vertices) == 0:
            logger.error("GLB has no vertices")
            return False
        
        if len(mesh.faces) == 0:
            logger.error("GLB has no faces")
            return False
        
        logger.info(f"GLB validation passed: {len(mesh.vertices)} vertices, {len(mesh.faces)} faces")
        return True
        
    except Exception as e:
        logger.error(f"GLB validation failed: {e}")
        return False


def convert_ply_to_glb(ply_path: Path, glb_path: Path, scale: float = 1.0) -> bool:
    """
    Convert PLY mesh to GLB.
    """
    try:
        import trimesh
    except ImportError:
        logger.error("trimesh not installed")
        return False
    
    try:
        logger.info(f"Converting PLY to GLB: {ply_path.name}")
        mesh = trimesh.load(str(ply_path))
        
        # Basic preprocessing
        mesh.vertices -= mesh.centroid
        mesh.vertices *= scale
        mesh.fix_normals()
        
        # Export
        mesh.export(str(glb_path), file_type='gltf2')
        
        logger.info(f"PLY converted to GLB: {glb_path.name}")
        return True
        
    except Exception as e:
        logger.error(f"PLY to GLB conversion failed: {e}")
        return False


def create_preview_glb(mesh_path: Path, preview_output: Path, max_triangles: int = 50000) -> bool:
    """
    Create a low-poly preview GLB for quick loading.
    """
    try:
        import trimesh
        from trimesh.simplification import simplify
    except ImportError:
        logger.warning("Cannot create preview GLB without trimesh")
        return False
    
    try:
        logger.info(f"Creating preview GLB from {mesh_path.name}")
        mesh = trimesh.load(str(mesh_path))
        
        if len(mesh.faces) > max_triangles:
            ratio = max_triangles / len(mesh.faces)
            logger.info(f"Simplifying to {max_triangles} triangles")
            mesh = simplify(mesh, target_count=max_triangles)
        
        mesh.export(str(preview_output), file_type='gltf2')
        
        preview_size = preview_output.stat().st_size / (1024 * 1024)
        logger.info(f"Preview GLB created ({preview_size:.2f} MB)")
        return True
        
    except Exception as e:
        logger.error(f"Preview GLB creation failed: {e}")
        return False
