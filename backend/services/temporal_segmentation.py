"""
Temporal Video Segmentation Pipeline v2 — Local Stabilization.

Replaces the global consensus approach with CURRENT-FRAME-DOMINANT
local temporal stabilization. The current frame's mask is always
authoritative. Neighbors only provide gentle rescue for thin
structures (legs, wheels, mesh backs) — they can NEVER override
the current frame's silhouette.

Architecture:
  1. ShadowSuppressor       — CLAHE shadow lifting before segmentation
  2. LocalTemporalStabilizer — current-frame-dominant sliding window
  3. GhostDetector          — detects and removes temporal ghost artifacts
  4. EdgeCleaner            — morphological cleanup AFTER stabilization
  5. ConsistencyValidator   — area + contour + edge stability checks

Key principle:
  GHOSTING is worse than FLICKERING for pseudo-3D rotation.
  Current frame geometry is ALWAYS the primary source of truth.
"""

import logging
from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)


# ─── Shadow Suppressor ──────────────────────────────────────────────

class ShadowSuppressor:
    """
    CLAHE-based shadow lifting in LAB color space.
    Applied BEFORE segmentation to help rembg produce cleaner masks.
    The suppressed image is used ONLY for segmentation — the final
    output uses original frame colors.
    """

    def __init__(self, clip_limit: float = 2.5, tile_size: int = 8):
        self.clahe = cv2.createCLAHE(
            clipLimit=clip_limit,
            tileGridSize=(tile_size, tile_size),
        )

    def suppress_file(self, input_path: Path, output_path: Path) -> Path:
        img = cv2.imread(str(input_path))
        if img is None:
            raise ValueError(f"Cannot read: {input_path}")
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        l = self.clahe.apply(l)
        result = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)
        cv2.imwrite(str(output_path), result)
        return output_path


# ─── Local Temporal Stabilizer ───────────────────────────────────────

class LocalTemporalStabilizer:
    """
    Current-frame-dominant sliding window stabilization.
    
    The current frame mask is ALWAYS the primary source of truth
    (weight = 0.80). Neighbors provide ONLY gentle rescue for thin
    structures that the current frame may have missed.
    
    Key differences from the old consensus:
    - NO max-union (which caused ghosting)
    - Current frame is ALWAYS dominant
    - Temporal decay: closer neighbors have more influence
    - Neighbors can only ADD pixels where the current frame has
      very low alpha AND neighbors consistently agree the pixel
      is furniture — preventing silhouette contamination
    """

    def __init__(
        self,
        window_radius: int = 2,
        current_weight: float = 0.80,
        rescue_threshold: int = 180,
    ):
        """
        Args:
            window_radius: Frames on each side (±2 = 5-frame window)
            current_weight: Weight of the current frame (0.80 = dominant)
            rescue_threshold: Neighbor alpha must exceed this to
                              attempt thin-structure rescue
        """
        self.window_radius = window_radius
        self.current_weight = current_weight
        self.neighbor_weight = 1.0 - current_weight
        self.rescue_threshold = rescue_threshold

    def stabilize(self, masks: List[np.ndarray]) -> List[np.ndarray]:
        """
        Stabilize masks using local temporal windows.
        Current frame always dominates. Neighbors only rescue
        thin structures where the current frame has gaps.
        """
        n = len(masks)
        if n <= 1:
            return [m.copy() for m in masks]

        result = []
        for i in range(n):
            current = masks[i].astype(np.float32)

            # Build weighted neighbor average with temporal decay
            start = max(0, i - self.window_radius)
            end = min(n, i + self.window_radius + 1)

            neighbor_sum = np.zeros_like(current)
            weight_sum = 0.0

            for j in range(start, end):
                if j == i:
                    continue  # Skip self
                distance = abs(j - i)
                # Temporal decay: closer = stronger
                decay = 1.0 / (1.0 + distance)
                neighbor_sum += masks[j].astype(np.float32) * decay
                weight_sum += decay

            if weight_sum > 0:
                neighbor_avg = neighbor_sum / weight_sum
            else:
                neighbor_avg = np.zeros_like(current)

            # ─── Current-frame-dominant blend ───
            # Start with the current frame as the base
            stabilized = current.copy()

            # Rescue zone: pixels where current frame has LOW alpha
            # but neighbors CONSISTENTLY show furniture
            current_weak = current < 30  # Current frame missed this area
            neighbor_strong = neighbor_avg > self.rescue_threshold  # Neighbors agree it's furniture
            rescue_zone = current_weak & neighbor_strong

            # Apply gentle rescue ONLY in the rescue zone
            # Use a fraction of the neighbor signal, NOT full override
            stabilized[rescue_zone] = (
                current[rescue_zone] * 0.3 +
                neighbor_avg[rescue_zone] * 0.7
            )

            # For pixels where current frame HAS signal,
            # apply very gentle stabilization to reduce flicker
            current_has_signal = current > 30
            if np.any(current_has_signal):
                stabilized[current_has_signal] = (
                    current[current_has_signal] * self.current_weight +
                    np.minimum(
                        neighbor_avg[current_has_signal],
                        current[current_has_signal]  # Neighbors can't EXCEED current
                    ) * self.neighbor_weight
                )

            stabilized = np.clip(stabilized, 0, 255).astype(np.uint8)
            result.append(stabilized)

        logger.info(
            f"Local stabilization: {n} masks "
            f"(window=±{self.window_radius}, "
            f"current_weight={self.current_weight})"
        )
        return result


# ─── Ghost Detector ──────────────────────────────────────────────────

class GhostDetector:
    """
    Detects and removes temporal ghost artifacts.
    
    Ghosts appear as translucent regions that exist in the stabilized
    mask but NOT in the current frame's raw segmentation. These are
    remnants from neighboring frames leaking through.
    """

    def __init__(self, ghost_alpha_max: int = 100, min_ghost_area: int = 500):
        """
        Args:
            ghost_alpha_max: Pixels with alpha below this that weren't
                             in the original mask are ghost candidates
            min_ghost_area: Minimum area (pixels) for a ghost region
        """
        self.ghost_alpha_max = ghost_alpha_max
        self.min_ghost_area = min_ghost_area

    def remove_ghosts(
        self,
        stabilized_masks: List[np.ndarray],
        raw_masks: List[np.ndarray],
    ) -> List[np.ndarray]:
        """
        Remove ghost artifacts by comparing stabilized masks
        against raw (pre-stabilization) masks.
        """
        cleaned = []
        ghosts_removed = 0

        for stab, raw in zip(stabilized_masks, raw_masks):
            # Ghost pixels: present in stabilized but NOT in raw
            ghost_zone = (stab > 10) & (raw <= 10)

            # Only remove ghost pixels that are weak (translucent)
            weak_ghost = ghost_zone & (stab < self.ghost_alpha_max)

            if np.any(weak_ghost):
                # Check if ghost region is large enough to be a real artifact
                ghost_area = np.sum(weak_ghost)
                if ghost_area > self.min_ghost_area:
                    result = stab.copy()
                    result[weak_ghost] = 0
                    cleaned.append(result)
                    ghosts_removed += 1
                    continue

            cleaned.append(stab.copy())

        if ghosts_removed > 0:
            logger.info(f"Ghost detection: removed ghosts from {ghosts_removed} frames")

        return cleaned


# ─── Edge Cleaner ────────────────────────────────────────────────────

class EdgeCleaner:
    """
    Morphological cleanup applied AFTER stabilization.
    
    Order is critical:
      segment → stabilize → ghost-clean → edge-clean → feather
    
    Feathering happens LAST to avoid propagating blurry alpha sludge.
    """

    def __init__(self, close_size: int = 5, feather_radius: int = 1):
        self.close_kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (close_size, close_size)
        )
        self.open_kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (3, 3)
        )
        self.feather_radius = feather_radius

    def clean(self, mask: np.ndarray) -> np.ndarray:
        """Clean edges: close holes → remove noise → feather edges."""
        # Step 1: Close small holes inside the furniture body
        closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, self.close_kernel)

        # Step 2: Remove small noise specks
        opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, self.open_kernel)

        # Step 3: Feather edges LAST (very gentle, 1px radius)
        if self.feather_radius > 0:
            k = self.feather_radius * 2 + 1
            dilated = cv2.dilate(opened, self.open_kernel, iterations=1)
            eroded = cv2.erode(opened, self.open_kernel, iterations=1)
            edge_zone = (dilated > 0) & (eroded == 0)
            blurred = cv2.GaussianBlur(opened, (k, k), 0)
            result = opened.copy()
            result[edge_zone] = blurred[edge_zone]
            return result

        return opened


# ─── Consistency Validator ───────────────────────────────────────────

class ConsistencyValidator:
    """
    Multi-metric validation: area + contour + edge stability.
    Rejects frames with clearly corrupted segmentation.
    """

    def __init__(self, min_area_ratio: float = 0.50):
        self.min_area_ratio = min_area_ratio

    def validate(
        self, masks: List[np.ndarray]
    ) -> List[Tuple[int, float]]:
        if not masks:
            return []

        areas = []
        contour_counts = []
        for mask in masks:
            binary = (mask > 30).astype(np.uint8) * 255
            area = int(np.sum(binary > 0))
            areas.append(area)

            contours, _ = cv2.findContours(
                binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            sig = [c for c in contours if cv2.contourArea(c) > area * 0.01] if area > 0 else []
            contour_counts.append(len(sig))

        median_area = float(np.median(areas)) if areas else 1.0

        scores = []
        for i, (area, cc) in enumerate(zip(areas, contour_counts)):
            area_ratio = area / max(median_area, 1.0)

            if area_ratio < self.min_area_ratio:
                scores.append((i, -1.0))
                logger.warning(f"Frame {i} REJECTED: area_ratio={area_ratio:.2f}")
                continue

            # Area score
            area_score = max(0.0, 1.0 - abs(area_ratio - 1.0) * 0.5)

            # Edge stability vs neighbors
            edge_score = 1.0
            if i > 0:
                change = abs(area - areas[i - 1]) / max(areas[i - 1], 1.0)
                if change > 0.4:
                    edge_score = 0.4

            composite = area_score * 0.6 + edge_score * 0.4
            scores.append((i, composite))

        valid = sum(1 for _, s in scores if s >= 0)
        logger.info(f"Validation: {valid}/{len(scores)} frames passed")
        return scores


# ─── Main Pipeline ───────────────────────────────────────────────────

class TemporalSegmentationPipeline:
    """
    Complete temporal segmentation pipeline v2.
    
    Current-frame-dominant architecture:
      shadow suppress → rembg → local stabilize → ghost detect →
      edge clean → validate → export with original colors
    """

    def __init__(
        self,
        consensus_window: int = 2,
        close_kernel: int = 5,
        feather_radius: int = 1,
    ):
        self.shadow_suppressor = ShadowSuppressor()
        self.stabilizer = LocalTemporalStabilizer(window_radius=consensus_window)
        self.ghost_detector = GhostDetector()
        self.edge_cleaner = EdgeCleaner(
            close_size=close_kernel,
            feather_radius=feather_radius,
        )
        self.validator = ConsistencyValidator()

    def _segment_single_frame(self, image_path: Path) -> np.ndarray:
        """Segment with rembg. Override for SAM2 GPU upgrade."""
        from services.background_removal import remove_background

        output_path = image_path.parent / f"_seg_{image_path.name}"
        try:
            remove_background(image_path, output_path)
            img = Image.open(output_path).convert("RGBA")
            alpha = np.array(img)[:, :, 3]
            return alpha
        except Exception as e:
            logger.warning(f"Segmentation failed for {image_path.name}: {e}")
            img = Image.open(image_path)
            return np.zeros((img.height, img.width), dtype=np.uint8)
        finally:
            if output_path.exists():
                output_path.unlink()

    def process_frames(
        self,
        frame_paths: List[Path],
        output_dir: Path,
    ) -> List[Tuple[Path, float]]:
        """
        Process frames through the full temporal pipeline.
        Returns (output_path, quality_score) for valid frames.
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        n = len(frame_paths)
        logger.info(f"Temporal segmentation v2: processing {n} frames...")

        # ─── Stage 1: Shadow suppression ───
        logger.info("  [1/6] Shadow suppression...")
        shadow_dir = output_dir / "_shadow_tmp"
        shadow_dir.mkdir(exist_ok=True)
        suppressed_paths = []
        for fp in frame_paths:
            out = shadow_dir / fp.name
            try:
                self.shadow_suppressor.suppress_file(fp, out)
            except Exception:
                import shutil
                shutil.copy2(fp, out)
            suppressed_paths.append(out)

        # ─── Stage 2: Per-frame segmentation ───
        logger.info("  [2/6] Per-frame segmentation (rembg)...")
        raw_masks = []
        for sp in suppressed_paths:
            mask = self._segment_single_frame(sp)
            raw_masks.append(mask)

        # Ensure consistent dimensions
        if raw_masks:
            h, w = raw_masks[0].shape[:2]
            for i in range(1, len(raw_masks)):
                if raw_masks[i].shape != (h, w):
                    raw_masks[i] = cv2.resize(raw_masks[i], (w, h))

        # ─── Stage 3: Local temporal stabilization ───
        logger.info("  [3/6] Local temporal stabilization...")
        stabilized = self.stabilizer.stabilize(raw_masks)

        # ─── Stage 4: Ghost detection ───
        logger.info("  [4/6] Ghost artifact detection...")
        deghosted = self.ghost_detector.remove_ghosts(stabilized, raw_masks)

        # ─── Stage 5: Edge cleanup (AFTER stabilization) ───
        logger.info("  [5/6] Edge cleanup + feathering...")
        cleaned = [self.edge_cleaner.clean(m) for m in deghosted]

        # ─── Stage 6: Consistency validation ───
        logger.info("  [6/6] Consistency validation...")
        scores = self.validator.validate(cleaned)

        # ─── Export: Apply masks to ORIGINAL frames ───
        results = []
        for i, (frame_path, (_, score)) in enumerate(zip(frame_paths, scores)):
            if score < 0:
                continue

            # Load ORIGINAL frame (not shadow-suppressed)
            img = Image.open(frame_path).convert("RGB")
            img_arr = np.array(img)

            mask = cleaned[i]
            if mask.shape[:2] != img_arr.shape[:2]:
                mask = cv2.resize(mask, (img_arr.shape[1], img_arr.shape[0]))

            rgba = np.dstack([img_arr, mask])
            output_path = output_dir / f"seg_{i:04d}.png"
            Image.fromarray(rgba, "RGBA").save(output_path, "PNG", optimize=True)
            results.append((output_path, score))

        # Cleanup
        import shutil
        shutil.rmtree(shadow_dir, ignore_errors=True)

        logger.info(f"Temporal segmentation v2 complete: {len(results)}/{n} valid")
        return results
