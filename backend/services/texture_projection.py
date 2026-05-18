"""
Multi-view texture projection and PBR material generation.

Projects original furniture photos onto the reconstructed 3D mesh to create
realistic textures from all viewing angles. Uses weighted blending where
views overlap.
"""

import logging
import math
from typing import List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)


def _create_camera_matrix(
    angle_deg: float,
    distance: float = 3.0,
    img_w: int = 512,
    img_h: int = 512,
    fov_deg: float = 50.0,
) -> Tuple[np.ndarray, np.ndarray]:
    """Create camera intrinsic and extrinsic matrices for a given angle."""
    angle_rad = math.radians(angle_deg)

    cx = distance * math.sin(angle_rad)
    cz = distance * math.cos(angle_rad)
    cy = 0.0

    eye = np.array([cx, cy, cz], dtype=np.float64)
    target = np.array([0, 0, 0], dtype=np.float64)
    up = np.array([0, 1, 0], dtype=np.float64)

    forward = target - eye
    forward = forward / np.linalg.norm(forward)
    right = np.cross(forward, up)
    right = right / np.linalg.norm(right)
    cam_up = np.cross(right, forward)

    R = np.array([right, cam_up, -forward], dtype=np.float64)
    t = -R @ eye
    Rt = np.hstack([R, t.reshape(3, 1)])

    focal = (img_w / 2) / math.tan(math.radians(fov_deg / 2))
    K = np.array([
        [focal, 0, img_w / 2],
        [0, focal, img_h / 2],
        [0, 0, 1],
    ], dtype=np.float64)

    return K, Rt


def project_and_bake_texture(
    mesh,
    images: List[np.ndarray],
    angles_deg: List[float],
    texture_size: int = 1024,
) -> Optional[np.ndarray]:
    """
    Project multiple view images onto the mesh and bake into a single texture atlas.

    Uses cylindrical UV mapping and weighted projection blending:
    - Each face gets color from the view with the best face-to-camera angle
    - Smooth blending at boundaries between view regions

    Args:
        mesh: trimesh.Trimesh object with UV coordinates
        images: List of source images (BGR, background-removed)
        angles_deg: Camera angle for each image
        texture_size: Output texture resolution

    Returns:
        Baked texture as numpy array (BGR), or None on failure
    """
    try:
        import trimesh
    except ImportError:
        logger.error("trimesh required for texture projection")
        return None

    if len(images) == 0 or len(images) != len(angles_deg):
        return None

    # Ensure mesh has UV coordinates
    if not hasattr(mesh.visual, 'uv') or mesh.visual.uv is None:
        _apply_cylindrical_uv(mesh)

    logger.info(f"Projecting textures from {len(images)} views onto {len(mesh.faces)} faces")

    # Create empty texture atlas
    texture = np.zeros((texture_size, texture_size, 3), dtype=np.uint8)
    weight_map = np.zeros((texture_size, texture_size), dtype=np.float32)

    # For each view, project image onto the texture atlas
    for view_idx, (image, angle) in enumerate(zip(images, angles_deg)):
        img_h, img_w = image.shape[:2]
        K, Rt = _create_camera_matrix(angle, img_w=img_w, img_h=img_h)

        # For each face, check if it's visible from this view
        face_centers = mesh.triangles_center
        face_normals = mesh.face_normals

        # Camera direction for this view
        angle_rad = math.radians(angle)
        cam_dir = np.array([
            -math.sin(angle_rad),
            0,
            -math.cos(angle_rad),
        ])

        for face_idx in range(len(mesh.faces)):
            normal = face_normals[face_idx]

            # Face visibility: dot product with camera direction
            dot = np.dot(normal, cam_dir)
            if dot <= 0:
                continue  # Face is back-facing to this camera

            # Weight by how directly the face is facing this camera
            view_weight = dot

            # Project face center to image coordinates
            center = face_centers[face_idx]
            point_h = np.append(center, 1.0)
            cam_point = Rt @ point_h
            if cam_point[2] <= 0:
                continue

            proj = K @ cam_point
            px = int(proj[0] / proj[2])
            py = int(proj[1] / proj[2])

            if 0 <= px < img_w and 0 <= py < img_h:
                # Get color from source image
                color = image[py, px]

                # Skip transparent / background pixels
                if np.all(color < 5):
                    continue

                # Get UV coordinates for this face's vertices
                face_vert_indices = mesh.faces[face_idx]
                uvs = mesh.visual.uv[face_vert_indices]

                # Map UV to texture pixel coordinates
                uv_center = uvs.mean(axis=0)
                tx = int(uv_center[0] * (texture_size - 1)) % texture_size
                ty = int((1 - uv_center[1]) * (texture_size - 1)) % texture_size

                # Paint a small region around the UV center
                radius = max(2, texture_size // 100)
                for dy in range(-radius, radius + 1):
                    for dx in range(-radius, radius + 1):
                        ux = (tx + dx) % texture_size
                        uy = (ty + dy) % texture_size

                        existing_weight = weight_map[uy, ux]
                        if view_weight > existing_weight:
                            texture[uy, ux] = color
                            weight_map[uy, ux] = view_weight

    # Fill empty regions with nearest neighbor
    empty = weight_map == 0
    if np.any(empty) and np.any(~empty):
        texture = _fill_empty_regions(texture, weight_map)

    # Slight blur to smooth seams
    texture = cv2.GaussianBlur(texture, (3, 3), 0)

    logger.info(f"Texture baked: {texture_size}x{texture_size}, "
                f"coverage={100 * np.mean(weight_map > 0):.0f}%")

    return texture


def _apply_cylindrical_uv(mesh) -> None:
    """Apply cylindrical UV mapping around Y axis."""
    import trimesh

    verts = mesh.vertices
    angles = np.arctan2(verts[:, 0], verts[:, 2])
    u = (angles + np.pi) / (2 * np.pi)

    y_min, y_max = verts[:, 1].min(), verts[:, 1].max()
    if y_max - y_min > 0:
        v = (verts[:, 1] - y_min) / (y_max - y_min)
    else:
        v = np.zeros(len(verts))

    uv = np.column_stack([u, v])
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv)


def _fill_empty_regions(
    texture: np.ndarray,
    weight_map: np.ndarray,
) -> np.ndarray:
    """Fill empty texture regions using inpainting."""
    mask = (weight_map == 0).astype(np.uint8) * 255

    try:
        filled = cv2.inpaint(texture, mask, inpaintRadius=5, flags=cv2.INPAINT_TELEA)
        return filled
    except Exception:
        return texture


def generate_roughness_map(albedo: np.ndarray, size: int = 512) -> np.ndarray:
    """
    Generate a simple roughness map from the albedo texture.
    Darker/smoother areas get lower roughness, textured areas get higher.
    """
    gray = cv2.cvtColor(albedo, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, (size, size))

    # Edge detection as proxy for surface roughness
    edges = cv2.Canny(gray, 50, 150)
    edges = cv2.GaussianBlur(edges.astype(np.float32), (15, 15), 0)

    # Normalize to 0.3-0.9 range (nothing is perfectly smooth or rough)
    roughness = 0.3 + 0.6 * (edges / 255.0)
    roughness = (roughness * 255).astype(np.uint8)

    return roughness


def generate_normal_map(albedo: np.ndarray, size: int = 512, strength: float = 2.0) -> np.ndarray:
    """
    Generate a simple normal map from the albedo texture using Sobel gradients.
    """
    gray = cv2.cvtColor(albedo, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gray = cv2.resize(gray, (size, size))
    gray = cv2.GaussianBlur(gray, (3, 3), 0)

    # Sobel gradients
    dx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3) * strength
    dy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3) * strength

    # Normal map (tangent space)
    normal = np.zeros((size, size, 3), dtype=np.float32)
    normal[:, :, 0] = -dx  # R = tangent X
    normal[:, :, 1] = -dy  # G = tangent Y
    normal[:, :, 2] = 1.0  # B = up

    # Normalize
    length = np.sqrt(np.sum(normal ** 2, axis=2, keepdims=True))
    normal = normal / (length + 1e-8)

    # Convert from [-1,1] to [0,255]
    normal = ((normal + 1) / 2 * 255).astype(np.uint8)

    return normal
