"""
Visual Hull 3D Reconstruction Engine.

Generates volumetric 3D meshes from multi-view silhouettes using:
1. Voxel carving from calibrated camera silhouettes
2. Depth-guided refinement (MiDaS/DepthAnything) for concave details
3. Marching Cubes mesh extraction
4. Mesh cleanup and simplification for web rendering

The Visual Hull algorithm:
- Discretize 3D space into a voxel grid
- For each camera view, back-project the silhouette into the voxel grid
- A voxel is "filled" only if it projects inside the silhouette in ALL views
- Extract the surface mesh using Marching Cubes
"""

import logging
import math
import time
from pathlib import Path
from typing import List, Tuple, Optional, Dict, Any

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# ─── Camera Angle Presets ─────────────────────────────────────────────

# Standard angles for multi-view capture (degrees from front)
STANDARD_ANGLES = {
    "front": 0,
    "front_left": 45,
    "left": 90,
    "back_left": 135,
    "back": 180,
    "back_right": 225,
    "right": 270,
    "front_right": 315,
}

# Minimum required angles for reasonable reconstruction
MIN_ANGLES = 4
PREFERRED_ANGLES = 8


def _create_camera_matrix(
    angle_deg: float,
    distance: float = 3.0,
    height: float = 0.0,
    img_w: int = 512,
    img_h: int = 512,
    fov_deg: float = 50.0,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Create camera intrinsic and extrinsic matrices for a given viewing angle.

    Camera orbits around the Y axis at a fixed distance, looking at the origin.

    Returns:
        (K, Rt) — intrinsic 3x3 and extrinsic 3x4 matrices
    """
    angle_rad = math.radians(angle_deg)

    # Camera position on a circle around Y axis
    cx = distance * math.sin(angle_rad)
    cz = distance * math.cos(angle_rad)
    cy = height

    # Look-at matrix (camera looks at origin)
    eye = np.array([cx, cy, cz], dtype=np.float64)
    target = np.array([0, 0, 0], dtype=np.float64)
    up = np.array([0, 1, 0], dtype=np.float64)

    forward = target - eye
    forward = forward / np.linalg.norm(forward)

    right = np.cross(forward, up)
    right = right / np.linalg.norm(right)

    cam_up = np.cross(right, forward)

    # Rotation matrix (world to camera)
    R = np.array([right, cam_up, -forward], dtype=np.float64)
    t = -R @ eye

    Rt = np.hstack([R, t.reshape(3, 1)])

    # Intrinsic matrix
    focal = (img_w / 2) / math.tan(math.radians(fov_deg / 2))
    K = np.array([
        [focal, 0, img_w / 2],
        [0, focal, img_h / 2],
        [0, 0, 1],
    ], dtype=np.float64)

    return K, Rt


def _project_voxel_to_image(
    voxel_center: np.ndarray,
    K: np.ndarray,
    Rt: np.ndarray,
) -> Tuple[int, int]:
    """Project a 3D voxel center to 2D image coordinates."""
    point_h = np.append(voxel_center, 1.0)
    cam_point = Rt @ point_h
    if cam_point[2] <= 0:
        return -1, -1
    proj = K @ cam_point
    px = int(proj[0] / proj[2])
    py = int(proj[1] / proj[2])
    return px, py


def reconstruct_visual_hull(
    silhouettes: List[np.ndarray],
    angles_deg: List[float],
    resolution: int = 96,
    volume_size: float = 2.0,
    depth_maps: Optional[List[np.ndarray]] = None,
) -> np.ndarray:
    """
    Reconstruct a 3D voxel grid using Visual Hull carving.

    Args:
        silhouettes: List of binary masks (white=foreground) for each view
        angles_deg: Camera angle in degrees for each silhouette
        resolution: Voxel grid resolution (higher = more detail, slower)
        volume_size: Physical size of the reconstruction volume
        depth_maps: Optional depth maps per view for depth-guided refinement

    Returns:
        3D numpy array (resolution^3) where 1=solid, 0=empty
    """
    assert len(silhouettes) == len(angles_deg), "Must have same number of silhouettes and angles"
    assert len(silhouettes) >= MIN_ANGLES, f"Need at least {MIN_ANGLES} views"

    t0 = time.time()
    logger.info(f"Visual Hull: Starting with {len(silhouettes)} views, resolution={resolution}")

    # Initialize voxel grid — all filled
    voxel_grid = np.ones((resolution, resolution, resolution), dtype=np.float32)

    # Voxel coordinates: map grid indices to world coordinates [-volume_size/2, volume_size/2]
    half = volume_size / 2
    voxel_step = volume_size / resolution

    # For each view, carve away voxels that don't project inside the silhouette
    for view_idx, (silhouette, angle) in enumerate(zip(silhouettes, angles_deg)):
        h, w = silhouette.shape[:2]
        K, Rt = _create_camera_matrix(angle, img_w=w, img_h=h)

        carved_count = 0
        total_filled = int(np.sum(voxel_grid > 0))

        for iz in range(resolution):
            for iy in range(resolution):
                for ix in range(resolution):
                    if voxel_grid[iz, iy, ix] <= 0:
                        continue

                    # Map voxel index to world coordinate
                    wx = -half + (ix + 0.5) * voxel_step
                    wy = half - (iy + 0.5) * voxel_step  # Y up
                    wz = -half + (iz + 0.5) * voxel_step

                    voxel_center = np.array([wx, wy, wz])
                    px, py = _project_voxel_to_image(voxel_center, K, Rt)

                    # If projection is outside image or on background, carve it
                    if px < 0 or px >= w or py < 0 or py >= h:
                        voxel_grid[iz, iy, ix] = 0
                        carved_count += 1
                    elif silhouette[py, px] == 0:
                        voxel_grid[iz, iy, ix] = 0
                        carved_count += 1

        remaining = int(np.sum(voxel_grid > 0))
        logger.info(
            f"  View {view_idx+1}/{len(silhouettes)} ({angle}°): "
            f"carved {carved_count} voxels, {remaining} remaining"
        )

    # ─── Depth-guided refinement ──────────────────────────────────────
    if depth_maps:
        logger.info("Visual Hull: Applying depth-guided refinement...")
        voxel_grid = _apply_depth_refinement(
            voxel_grid, depth_maps, angles_deg, resolution, volume_size
        )

    # ─── Morphological cleanup ────────────────────────────────────────
    # Remove isolated voxels and fill small holes
    from scipy import ndimage

    # Remove small disconnected components
    labeled, num_features = ndimage.label(voxel_grid > 0)
    if num_features > 1:
        component_sizes = ndimage.sum(voxel_grid > 0, labeled, range(1, num_features + 1))
        largest = np.argmax(component_sizes) + 1
        voxel_grid[labeled != largest] = 0
        logger.info(f"  Cleaned: kept largest component, removed {num_features - 1} fragments")

    # Gentle smoothing
    voxel_grid = ndimage.uniform_filter(voxel_grid, size=2)
    voxel_grid = (voxel_grid > 0.4).astype(np.float32)

    elapsed = time.time() - t0
    final_filled = int(np.sum(voxel_grid > 0))
    logger.info(f"Visual Hull: Done in {elapsed:.1f}s — {final_filled} filled voxels")

    return voxel_grid


def _apply_depth_refinement(
    voxel_grid: np.ndarray,
    depth_maps: List[np.ndarray],
    angles_deg: List[float],
    resolution: int,
    volume_size: float,
) -> np.ndarray:
    """
    Refine the visual hull using depth maps to carve concavities.

    Depth maps from MiDaS/DepthAnything help carve out concave features
    (e.g., sofa cushion indentations, chair seat curves) that the visual hull
    cannot capture from silhouettes alone.
    """
    half = volume_size / 2
    voxel_step = volume_size / resolution

    for view_idx, (depth_map, angle) in enumerate(zip(depth_maps, angles_deg)):
        if depth_map is None:
            continue

        h, w = depth_map.shape[:2]
        K, Rt = _create_camera_matrix(angle, img_w=w, img_h=h)

        # Normalize depth to 0-1 range
        d_min, d_max = depth_map.min(), depth_map.max()
        if d_max - d_min < 1e-6:
            continue
        depth_norm = (depth_map.astype(np.float32) - d_min) / (d_max - d_min)

        refined_count = 0
        for iz in range(resolution):
            for iy in range(resolution):
                for ix in range(resolution):
                    if voxel_grid[iz, iy, ix] <= 0:
                        continue

                    wx = -half + (ix + 0.5) * voxel_step
                    wy = half - (iy + 0.5) * voxel_step
                    wz = -half + (iz + 0.5) * voxel_step

                    voxel_center = np.array([wx, wy, wz])
                    px, py = _project_voxel_to_image(voxel_center, K, Rt)

                    if px < 0 or px >= w or py < 0 or py >= h:
                        continue

                    # Compute expected depth from camera to voxel
                    point_h = np.append(voxel_center, 1.0)
                    cam_point = Rt @ point_h
                    voxel_depth_norm = cam_point[2] / (volume_size * 2)

                    # If voxel is significantly behind the depth surface, carve it
                    observed_depth = depth_norm[py, px]
                    if voxel_depth_norm > observed_depth + 0.15:
                        voxel_grid[iz, iy, ix] = 0
                        refined_count += 1

        if refined_count > 0:
            logger.info(f"  Depth refinement view {view_idx+1}: carved {refined_count} voxels")

    return voxel_grid


def extract_mesh(
    voxel_grid: np.ndarray,
    volume_size: float = 2.0,
) -> Optional[Any]:
    """
    Extract a triangle mesh from the voxel grid using Marching Cubes.

    Returns:
        trimesh.Trimesh object, or None if extraction fails
    """
    try:
        from skimage.measure import marching_cubes
        import trimesh
    except ImportError as e:
        logger.error(f"Missing dependency for mesh extraction: {e}")
        return None

    # Pad the grid so marching cubes can find the surface at boundaries
    padded = np.pad(voxel_grid, pad_width=1, mode='constant', constant_values=0)

    try:
        verts, faces, normals, _ = marching_cubes(padded, level=0.5)
    except Exception as e:
        logger.error(f"Marching cubes failed: {e}")
        return None

    if len(verts) == 0 or len(faces) == 0:
        logger.error("Marching cubes produced empty mesh")
        return None

    # Map vertices from grid space to world space
    half = volume_size / 2
    resolution = voxel_grid.shape[0]
    # Subtract 1 for the padding offset
    verts = (verts - 1) / resolution * volume_size - half

    mesh = trimesh.Trimesh(vertices=verts, faces=faces, vertex_normals=normals)

    # Fix winding order
    mesh.fix_normals()

    logger.info(f"Mesh extracted: {len(mesh.vertices)} vertices, {len(mesh.faces)} faces")
    return mesh


def simplify_mesh(
    mesh: Any,
    target_faces: int = 5000,
) -> Any:
    """
    Simplify mesh for web rendering using quadric decimation.

    Target: ~5000 faces for good quality at reasonable file size.
    """
    import trimesh

    current_faces = len(mesh.faces)
    if current_faces <= target_faces:
        logger.info(f"Mesh already at {current_faces} faces, no simplification needed")
        return mesh

    try:
        # Try pyfqmr (fast quadric mesh reduction)
        import pyfqmr
        simplifier = pyfqmr.Simplify()
        simplifier.setMesh(mesh.vertices, mesh.faces)
        simplifier.simplify_mesh(
            target_count=target_faces,
            aggressiveness=5,
            preserve_border=True,
        )
        verts, faces, _ = simplifier.getMesh()
        simplified = trimesh.Trimesh(vertices=verts, faces=faces)
        simplified.fix_normals()
        logger.info(f"Simplified: {current_faces} → {len(simplified.faces)} faces (pyfqmr)")
        return simplified
    except ImportError:
        pass

    try:
        # Fallback: trimesh's built-in simplification
        simplified = mesh.simplify_quadric_decimation(target_faces)
        simplified.fix_normals()
        logger.info(f"Simplified: {current_faces} → {len(simplified.faces)} faces (trimesh)")
        return simplified
    except Exception as e:
        logger.warning(f"Simplification failed, returning original: {e}")
        return mesh


def center_and_normalize_mesh(mesh: Any, target_height: float = 1.0) -> Any:
    """
    Center mesh at origin and normalize to target height.
    The mesh sits on Y=0 (floor level).
    """
    # Center horizontally
    bounds = mesh.bounds
    center = (bounds[0] + bounds[1]) / 2
    mesh.vertices -= center

    # Sit on floor (Y=0)
    min_y = mesh.vertices[:, 1].min()
    mesh.vertices[:, 1] -= min_y

    # Scale to target height
    current_height = mesh.vertices[:, 1].max()
    if current_height > 0:
        scale = target_height / current_height
        mesh.vertices *= scale

    return mesh


def export_glb(
    mesh: Any,
    output_path: Path,
    texture_image: Optional[np.ndarray] = None,
) -> Optional[str]:
    """
    Export mesh as GLB with optional texture and Draco compression.

    Returns:
        Path to the exported GLB file, or None on failure
    """
    import trimesh

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        if texture_image is not None:
            # Create a textured mesh
            material = trimesh.visual.material.PBRMaterial(
                baseColorFactor=[255, 255, 255, 255],
                metallicFactor=0.0,
                roughnessFactor=0.8,
            )

            # Convert texture to PIL Image for trimesh
            from PIL import Image as PILImage
            if isinstance(texture_image, np.ndarray):
                tex_pil = PILImage.fromarray(cv2.cvtColor(texture_image, cv2.COLOR_BGR2RGB))
            else:
                tex_pil = texture_image

            material.baseColorTexture = tex_pil

            # Apply UV coordinates if mesh doesn't have them
            if not hasattr(mesh.visual, 'uv') or mesh.visual.uv is None:
                # Simple cylindrical UV projection
                _apply_cylindrical_uv(mesh)

            mesh.visual = trimesh.visual.TextureVisuals(
                uv=mesh.visual.uv if hasattr(mesh.visual, 'uv') else None,
                material=material,
            )

        # Export as GLB
        glb_data = mesh.export(file_type='glb')
        output_path.write_bytes(glb_data)

        file_size = output_path.stat().st_size
        logger.info(f"GLB exported: {output_path.name} ({file_size:,} bytes)")
        return str(output_path)

    except Exception as e:
        logger.error(f"GLB export failed: {e}")
        return None


def _apply_cylindrical_uv(mesh: Any) -> None:
    """Apply cylindrical UV mapping for texture projection."""
    verts = mesh.vertices
    # Cylindrical projection around Y axis
    angles = np.arctan2(verts[:, 0], verts[:, 2])
    u = (angles + np.pi) / (2 * np.pi)

    # V from Y coordinate (normalized 0-1)
    y_min, y_max = verts[:, 1].min(), verts[:, 1].max()
    if y_max - y_min > 0:
        v = (verts[:, 1] - y_min) / (y_max - y_min)
    else:
        v = np.zeros(len(verts))

    uv = np.column_stack([u, v])

    import trimesh
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv)


# ─── Full Pipeline ────────────────────────────────────────────────────

def reconstruct_furniture(
    image_paths: List[Path],
    angle_labels: List[str],
    output_dir: Path,
    item_id: str,
    target_height_cm: float = 100.0,
    resolution: int = 96,
    use_depth: bool = True,
) -> Dict[str, Any]:
    """
    Full reconstruction pipeline: images → GLB model.

    Args:
        image_paths: Paths to uploaded furniture images
        angle_labels: Angle label for each image (e.g., 'front', 'left', ...)
        output_dir: Directory to save the GLB output
        item_id: Unique ID for this furniture item
        target_height_cm: Target furniture height in cm
        resolution: Voxel resolution (64=fast, 96=balanced, 128=quality)
        use_depth: Whether to use depth estimation for refinement

    Returns:
        Dict with status, model_url, mesh stats
    """
    from services.background_removal import remove_background, extract_silhouette

    t0 = time.time()
    result = {
        "status": "processing",
        "steps": [],
        "model_url": "",
        "mesh_vertices": 0,
        "mesh_faces": 0,
        "file_size_bytes": 0,
    }

    output_dir.mkdir(parents=True, exist_ok=True)

    # ─── Step 1: Background removal + silhouette extraction ───────
    result["steps"].append({"name": "Removing backgrounds", "status": "processing"})
    silhouettes = []
    processed_images = []
    angles_deg = []

    for img_path, label in zip(image_paths, angle_labels):
        angle = STANDARD_ANGLES.get(label, 0)
        angles_deg.append(angle)

        # Remove background
        processed_path = output_dir / f"{item_id}_{label}_processed.png"
        try:
            remove_background(img_path, processed_path)
        except Exception as e:
            logger.warning(f"BG removal failed for {label}: {e}")
            processed_path = img_path

        # Extract binary silhouette
        silhouette = extract_silhouette(processed_path)
        silhouettes.append(silhouette)

        # Load processed image for texturing
        proc_img = cv2.imread(str(processed_path))
        if proc_img is not None:
            processed_images.append(proc_img)
        else:
            processed_images.append(cv2.imread(str(img_path)))

    result["steps"][-1]["status"] = "completed"

    # ─── Step 2: Depth estimation (optional) ──────────────────────
    depth_maps = None
    if use_depth:
        result["steps"].append({"name": "Estimating depth", "status": "processing"})
        try:
            from services.depth_estimation import estimate_depth
            depth_maps = []
            for img_path, label in zip(image_paths, angle_labels):
                depth_path = output_dir / f"{item_id}_{label}_depth.png"
                try:
                    estimate_depth(img_path, depth_path)
                    depth_img = cv2.imread(str(depth_path), cv2.IMREAD_GRAYSCALE)
                    depth_maps.append(depth_img)
                except Exception:
                    depth_maps.append(None)
            result["steps"][-1]["status"] = "completed"
        except Exception as e:
            logger.warning(f"Depth estimation unavailable: {e}")
            depth_maps = None
            result["steps"][-1]["status"] = "skipped"

    # ─── Step 3: Visual Hull reconstruction ───────────────────────
    result["steps"].append({"name": "Reconstructing 3D shape", "status": "processing"})

    voxel_grid = reconstruct_visual_hull(
        silhouettes=silhouettes,
        angles_deg=angles_deg,
        resolution=resolution,
        depth_maps=depth_maps,
    )

    if np.sum(voxel_grid > 0) < 100:
        result["status"] = "failed"
        result["error"] = "Reconstruction produced too few voxels — check image quality"
        return result

    result["steps"][-1]["status"] = "completed"

    # ─── Step 4: Mesh extraction ──────────────────────────────────
    result["steps"].append({"name": "Extracting mesh", "status": "processing"})

    mesh = extract_mesh(voxel_grid)
    if mesh is None:
        result["status"] = "failed"
        result["error"] = "Mesh extraction failed"
        return result

    result["steps"][-1]["status"] = "completed"

    # ─── Step 5: Mesh simplification ──────────────────────────────
    result["steps"].append({"name": "Optimizing for web", "status": "processing"})

    mesh = simplify_mesh(mesh, target_faces=5000)

    # Normalize size (1 cm = 0.01 in 3D scene units)
    target_3d_height = target_height_cm * 0.01
    mesh = center_and_normalize_mesh(mesh, target_height=target_3d_height)

    result["steps"][-1]["status"] = "completed"

    # ─── Step 6: Texture projection ───────────────────────────────
    result["steps"].append({"name": "Applying textures", "status": "processing"})

    try:
        from services.texture_projection import project_and_bake_texture
        texture = project_and_bake_texture(mesh, processed_images, angles_deg)
    except Exception as e:
        logger.warning(f"Texture projection failed, using flat color: {e}")
        texture = None

    result["steps"][-1]["status"] = "completed"

    # ─── Step 7: GLB export ───────────────────────────────────────
    result["steps"].append({"name": "Exporting 3D model", "status": "processing"})

    glb_path = output_dir / f"{item_id}.glb"
    export_result = export_glb(mesh, glb_path, texture_image=texture)

    if export_result is None:
        result["status"] = "failed"
        result["error"] = "GLB export failed"
        return result

    result["steps"][-1]["status"] = "completed"

    # ─── Done ─────────────────────────────────────────────────────
    elapsed = time.time() - t0
    result["status"] = "completed"
    result["model_url"] = f"/uploads/furniture/models/{item_id}.glb"
    result["mesh_vertices"] = len(mesh.vertices)
    result["mesh_faces"] = len(mesh.faces)
    result["file_size_bytes"] = glb_path.stat().st_size
    result["processing_time_seconds"] = round(elapsed, 1)

    logger.info(
        f"Reconstruction complete: {item_id} — "
        f"{len(mesh.vertices)} verts, {len(mesh.faces)} faces, "
        f"{result['file_size_bytes']:,} bytes, {elapsed:.1f}s"
    )

    return result
