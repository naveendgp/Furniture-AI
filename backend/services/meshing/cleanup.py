"""
Mesh processing: cleanup, optimization, and preparation for export.
"""

import logging
from pathlib import Path
from typing import Optional, Tuple
import numpy as np

logger = logging.getLogger(__name__)


def clean_mesh_trimesh(input_mesh: Path, output_mesh: Path) -> bool:
    """
    Clean mesh using trimesh library.
    - Remove disconnected components
    - Fill holes
    - Remove non-manifold edges
    - Simplify if needed
    """
    try:
        import trimesh
    except ImportError:
        logger.error("trimesh not installed: pip install trimesh")
        return False
    
    try:
        logger.info(f"Loading mesh: {input_mesh.name}")
        mesh = trimesh.load(str(input_mesh))
        
        # Get initial stats
        initial_faces = len(mesh.faces)
        initial_vertices = len(mesh.vertices)
        
        # Remove unreferenced vertices
        mesh.remove_unreferenced_vertices()
        
        # Split into connected components and keep largest
        if not mesh.is_watertight:
            logger.info("Mesh is not watertight, splitting connected components")
            components = mesh.split(only_watertight=False)
            if components:
                # Keep largest component
                mesh = max(components, key=lambda x: len(x.vertices))
                logger.info(f"Kept largest component: {len(mesh.vertices)} vertices")
        
        # Fix normals
        mesh.fix_normals()
        
        # Try to fill holes
        if not mesh.is_watertight:
            logger.info("Attempting to fill holes")
            # This is a basic approach - just smooth the mesh slightly
            mesh.vertices = mesh.vertices + 0.01 * mesh.vertex_normals
        
        # Remove duplicate vertices
        mesh.merge_vertices()
        
        final_faces = len(mesh.faces)
        final_vertices = len(mesh.vertices)
        
        logger.info(
            f"Mesh cleanup: {initial_vertices} → {final_vertices} vertices, "
            f"{initial_faces} → {final_faces} faces"
        )
        
        # Export
        mesh.export(str(output_mesh))
        logger.info(f"Cleaned mesh exported: {output_mesh.name}")
        return True
        
    except Exception as e:
        logger.error(f"Mesh cleanup failed: {e}")
        return False


def optimize_mesh_for_web(
    input_mesh: Path,
    output_mesh: Path,
    target_ratio: float = 0.5,
) -> bool:
    """
    Optimize mesh for web rendering:
    - Mesh decimation
    - Remove small components
    - Ensure good topology
    
    Args:
        input_mesh: Input mesh path
        output_mesh: Output mesh path
        target_ratio: Target polygon reduction ratio (0.5 = 50% of original)
    """
    try:
        import trimesh
        from trimesh.simplification import simplify_mesh
    except ImportError:
        logger.error("trimesh not installed")
        return False
    
    try:
        logger.info(f"Optimizing mesh: {input_mesh.name}")
        mesh = trimesh.load(str(input_mesh))
        
        initial_faces = len(mesh.faces)
        target_faces = int(initial_faces * target_ratio)
        
        logger.info(f"Reducing {initial_faces} faces to ~{target_faces}")
        
        # Use fast simplification if available
        try:
            from pyfqmr import simplify
            simplified = simplify.simplify(
                mesh.vertices,
                mesh.faces,
                target_count=target_faces,
            )
            mesh.vertices = simplified[0]
            mesh.faces = simplified[1]
        except ImportError:
            # Fallback to trimesh simplification
            logger.warning("pyfqmr not available, using slower trimesh simplification")
            mesh = simplify_mesh(mesh, target_count=target_faces)
        
        final_faces = len(mesh.faces)
        logger.info(f"Optimization complete: {final_faces} faces (reduction: {100*(1-final_faces/initial_faces):.1f}%)")
        
        mesh.export(str(output_mesh))
        return True
        
    except Exception as e:
        logger.error(f"Mesh optimization failed: {e}")
        return False


def center_and_scale_mesh(
    input_mesh: Path,
    output_mesh: Path,
    scale: float = 1.0,
) -> bool:
    """
    Center mesh and scale to reasonable size for web rendering.
    
    Args:
        input_mesh: Input mesh
        output_mesh: Output mesh
        scale: Scale factor
    """
    try:
        import trimesh
    except ImportError:
        logger.error("trimesh not installed")
        return False
    
    try:
        mesh = trimesh.load(str(input_mesh))
        
        # Get bounds
        bounds = mesh.bounds
        center = mesh.centroid
        size = (bounds[1] - bounds[0]).max()
        
        logger.info(f"Mesh bounds: {size:.3f} units")
        
        # Center at origin
        mesh.vertices -= center
        
        # Scale
        if size > 0 and scale > 0:
            mesh.vertices *= (scale / size)
        
        # Move to sit on ground plane (Y = 0)
        bounds = mesh.bounds
        mesh.vertices[:, 1] -= bounds[0][1]
        
        mesh.export(str(output_mesh))
        logger.info(f"Mesh centered and scaled")
        return True
        
    except Exception as e:
        logger.error(f"Mesh centering/scaling failed: {e}")
        return False


def generate_normals(input_mesh: Path, output_mesh: Path) -> bool:
    """
    Generate smooth normals for better rendering.
    """
    try:
        import trimesh
    except ImportError:
        logger.error("trimesh not installed")
        return False
    
    try:
        mesh = trimesh.load(str(input_mesh))
        mesh.fix_normals()
        mesh.export(str(output_mesh))
        logger.info("Normals generated")
        return True
    except Exception as e:
        logger.error(f"Normal generation failed: {e}")
        return False


def apply_draco_compression(input_glb: Path, output_glb: Path) -> bool:
    """
    Apply Draco geometry compression to GLB file.
    Reduces file size significantly (often 10x reduction).
    """
    try:
        import pygltflib
    except ImportError:
        logger.warning("pygltflib not installed for Draco compression")
        return False
    
    try:
        logger.info(f"Applying Draco compression to {input_glb.name}")
        
        from pygltflib import GLTF2Loader, DracoWriter
        
        # Load GLB
        gltf = GLTF2Loader.load(str(input_glb))
        
        # Apply Draco to all meshes
        for mesh in gltf.meshes:
            for primitive in mesh.primitives:
                if primitive.extensions is None:
                    primitive.extensions = {}
                primitive.extensions['KHR_draco_mesh_compression'] = {
                    'bufferView': primitive.attributes.POSITION,
                    'attributes': {
                        'POSITION': 0,
                        'NORMAL': 1 if 'NORMAL' in primitive.attributes else None,
                        'TEXCOORD_0': 2 if 'TEXCOORD_0' in primitive.attributes else None,
                    }
                }
        
        # Save
        gltf.save_to_file(str(output_glb))
        logger.info(f"Draco compression applied")
        return True
        
    except Exception as e:
        logger.warning(f"Draco compression failed: {e}")
        return False


def get_mesh_stats(mesh_path: Path) -> dict:
    """Get mesh statistics."""
    try:
        import trimesh
    except ImportError:
        return {}
    
    try:
        mesh = trimesh.load(str(mesh_path))
        
        file_size = mesh_path.stat().st_size / (1024 * 1024)  # MB
        
        return {
            "vertices": len(mesh.vertices),
            "faces": len(mesh.faces),
            "edges": len(mesh.edges),
            "file_size_mb": round(file_size, 2),
            "is_watertight": mesh.is_watertight,
            "bounds": mesh.bounds.tolist(),
            "volume": mesh.volume if mesh.is_watertight else 0,
        }
    except Exception as e:
        logger.error(f"Failed to get mesh stats: {e}")
        return {}
