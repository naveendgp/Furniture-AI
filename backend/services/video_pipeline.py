"""
360° Furniture Video → Directional Angle Extraction Pipeline.

Processes an orbit-style furniture video and extracts the 8 best
directional images (front, front_right, right, etc.) for the existing
2.5D rendering engine.

Pipeline stages:
  1. Video metadata extraction (FFmpeg/ffprobe)
  2. Candidate frame extraction (FFmpeg at adaptive FPS)
  3. Frame quality filtering (Laplacian blur detection)
  4. Duplicate/similarity filtering (SSIM clustering)
  5. Orbit-based angle classification
  6. Best-frame selection per angle bucket
  7. Background removal + image normalization
"""

import json
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image

from services.background_removal import remove_background

logger = logging.getLogger(__name__)

# ─── Constants ───────────────────────────────────────────────────────

ANGLE_LABELS = [
    "front",        # 0°
    "front_right",  # 45°
    "right",        # 90°
    "back_right",   # 135°
    "back",         # 180°
    "back_left",    # 225°
    "left",         # 270°
    "front_left",   # 315°
]

TARGET_CANVAS = 1024  # Final output image size (square)
MIN_VIDEO_DURATION = 2.0  # Minimum video length in seconds
EXTRACTION_FPS = 2  # Frames per second to extract
SSIM_THRESHOLD = 0.92  # Frames more similar than this are duplicates
MIN_SHARPNESS_RATIO = 0.5  # Reject frames below mean - 0.5*std sharpness


# ─── Stage 1: Video Metadata ────────────────────────────────────────

def extract_video_metadata(video_path: Path) -> Dict:
    """
    Extract video metadata using ffprobe.
    
    Returns dict with: duration, fps, width, height, codec.
    Raises ValueError if video is too short or unreadable.
    """
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(video_path),
    ]

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            raise ValueError(f"ffprobe failed: {result.stderr[:200]}")

        data = json.loads(result.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
        raise ValueError(f"Cannot read video metadata: {e}")

    # Find the video stream
    video_stream = None
    for stream in data.get("streams", []):
        if stream.get("codec_type") == "video":
            video_stream = stream
            break

    if not video_stream:
        raise ValueError("No video stream found in file")

    # Parse FPS from r_frame_rate (e.g., "30/1")
    fps_parts = video_stream.get("r_frame_rate", "30/1").split("/")
    fps = float(fps_parts[0]) / float(fps_parts[1]) if len(fps_parts) == 2 else 30.0

    duration = float(data.get("format", {}).get("duration", 0))
    if duration < MIN_VIDEO_DURATION:
        raise ValueError(
            f"Video too short ({duration:.1f}s). Minimum {MIN_VIDEO_DURATION}s required."
        )

    metadata = {
        "duration": duration,
        "fps": fps,
        "width": int(video_stream.get("width", 0)),
        "height": int(video_stream.get("height", 0)),
        "codec": video_stream.get("codec_name", "unknown"),
        "total_frames": int(duration * fps),
    }

    logger.info(
        f"Video metadata: {metadata['width']}x{metadata['height']} "
        f"@ {metadata['fps']:.1f}fps, {metadata['duration']:.1f}s"
    )
    return metadata


# ─── Stage 2: Frame Extraction ──────────────────────────────────────

def extract_candidate_frames(
    video_path: Path, output_dir: Path, fps: int = EXTRACTION_FPS
) -> List[Path]:
    """
    Extract candidate frames from video using FFmpeg at a fixed FPS.
    
    Returns list of extracted frame file paths sorted by frame number.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    pattern = str(output_dir / "frame_%04d.png")

    cmd = [
        "ffmpeg",
        "-i", str(video_path),
        "-vf", f"fps={fps}",
        "-q:v", "2",  # High quality PNG
        "-vsync", "vfr",
        pattern,
        "-y",  # Overwrite
    ]

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=120
        )
        if result.returncode != 0:
            logger.warning(f"FFmpeg stderr: {result.stderr[:300]}")
    except subprocess.TimeoutExpired:
        raise ValueError("Frame extraction timed out (>120s)")

    frames = sorted(output_dir.glob("frame_*.png"))
    logger.info(f"Extracted {len(frames)} candidate frames at {fps} FPS")

    if len(frames) < 4:
        raise ValueError(
            f"Only {len(frames)} frames extracted. Need at least 4 for angle coverage."
        )

    return frames


# ─── Stage 3: Frame Quality Filtering ───────────────────────────────

def compute_sharpness(image_path: Path) -> float:
    """Compute Laplacian variance as a sharpness score."""
    img = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
    if img is None:
        return 0.0
    laplacian = cv2.Laplacian(img, cv2.CV_64F)
    return float(laplacian.var())


def compute_exposure_score(image_path: Path) -> float:
    """
    Score exposure quality. 1.0 = perfect, 0.0 = severely over/underexposed.
    Measures how centered the histogram is around the midtones.
    """
    img = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
    if img is None:
        return 0.0
    mean_val = float(np.mean(img))
    # Ideal mean is ~128. Penalize deviation.
    deviation = abs(mean_val - 128) / 128.0
    return max(0.0, 1.0 - deviation)


def filter_frame_quality(frames: List[Path]) -> List[Tuple[Path, float]]:
    """
    Filter out blurry/poor-quality frames.
    
    Returns list of (path, sharpness_score) for frames that pass quality threshold.
    """
    scored = []
    for f in frames:
        sharpness = compute_sharpness(f)
        scored.append((f, sharpness))

    if not scored:
        return []

    # Dynamic threshold: reject frames below (mean - 0.5 * std)
    scores = [s for _, s in scored]
    mean_s = float(np.mean(scores))
    std_s = float(np.std(scores))
    threshold = mean_s - MIN_SHARPNESS_RATIO * std_s

    passed = [(f, s) for f, s in scored if s >= threshold]
    rejected = len(scored) - len(passed)

    logger.info(
        f"Quality filter: {len(passed)} passed, {rejected} rejected "
        f"(threshold={threshold:.1f}, mean={mean_s:.1f})"
    )
    return passed


# ─── Stage 4: Duplicate/Similarity Filtering ────────────────────────

def compute_ssim(img_a: np.ndarray, img_b: np.ndarray) -> float:
    """Compute SSIM between two grayscale images."""
    try:
        from skimage.metrics import structural_similarity
        # Resize both to same small size for fast comparison
        size = (256, 256)
        a = cv2.resize(img_a, size)
        b = cv2.resize(img_b, size)
        score, _ = structural_similarity(a, b, full=True)
        return float(score)
    except ImportError:
        # Fallback: simple histogram correlation
        hist_a = cv2.calcHist([img_a], [0], None, [64], [0, 256])
        hist_b = cv2.calcHist([img_b], [0], None, [64], [0, 256])
        cv2.normalize(hist_a, hist_a)
        cv2.normalize(hist_b, hist_b)
        return float(cv2.compareHist(hist_a, hist_b, cv2.HISTCMP_CORREL))


def deduplicate_frames(
    frames: List[Tuple[Path, float]], threshold: float = SSIM_THRESHOLD
) -> List[Tuple[Path, float]]:
    """
    Remove near-duplicate frames using SSIM.
    
    When two frames are too similar (SSIM > threshold), keeps the sharper one.
    """
    if len(frames) <= 1:
        return frames

    # Load all grayscale images
    images = []
    for path, score in frames:
        img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        images.append(img)

    keep = [True] * len(frames)

    for i in range(len(frames)):
        if not keep[i]:
            continue
        for j in range(i + 1, len(frames)):
            if not keep[j]:
                continue
            ssim = compute_ssim(images[i], images[j])
            if ssim > threshold:
                # Keep the sharper one
                if frames[i][1] >= frames[j][1]:
                    keep[j] = False
                else:
                    keep[i] = False
                    break

    result = [f for f, k in zip(frames, keep) if k]
    removed = len(frames) - len(result)
    logger.info(f"Deduplication: {len(result)} unique frames, {removed} duplicates removed")
    return result


# ─── Stage 5: Angle Classification ──────────────────────────────────

def classify_angles(
    frames: List[Tuple[Path, float]],
) -> Dict[str, List[Tuple[Path, float]]]:
    """
    Classify frames into 8 directional angle buckets using orbit progression.
    
    Assumes the video is a continuous clockwise orbit starting from the front.
    Each frame's position in the sequence maps to an angle:
      frame_index / total_frames * 360° → nearest angle bucket.
    """
    n = len(frames)
    if n == 0:
        return {}

    buckets: Dict[str, List[Tuple[Path, float]]] = {
        label: [] for label in ANGLE_LABELS
    }

    for i, (path, score) in enumerate(frames):
        # Map frame position to degrees (0° = front, clockwise)
        angle_deg = (i / n) * 360.0

        # Find nearest angle bucket
        best_label = ANGLE_LABELS[0]
        best_dist = 999.0
        for j, label in enumerate(ANGLE_LABELS):
            bucket_deg = j * 45.0
            # Circular distance
            dist = min(
                abs(angle_deg - bucket_deg),
                360.0 - abs(angle_deg - bucket_deg),
            )
            if dist < best_dist:
                best_dist = dist
                best_label = label

        buckets[best_label].append((path, score))

    # Log distribution
    dist_str = ", ".join(f"{k}:{len(v)}" for k, v in buckets.items() if v)
    logger.info(f"Angle classification: {dist_str}")

    return buckets


# ─── Stage 6: Best Frame Selection ──────────────────────────────────

def compute_centering_score(image_path: Path) -> float:
    """
    Score how well-centered the main object is in the frame.
    Uses contour analysis on the foreground.
    """
    img = cv2.imread(str(image_path))
    if img is None:
        return 0.0

    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Simple threshold to find the main object
    _, thresh = cv2.threshold(gray, 30, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return 0.5

    # Find largest contour
    largest = max(contours, key=cv2.contourArea)
    M = cv2.moments(largest)
    if M["m00"] == 0:
        return 0.5

    cx = M["m10"] / M["m00"]
    cy = M["m01"] / M["m00"]

    # Score: how close the centroid is to the frame center
    dx = abs(cx - w / 2) / (w / 2)
    dy = abs(cy - h / 2) / (h / 2)
    return max(0.0, 1.0 - (dx + dy) / 2.0)


def select_best_per_angle(
    buckets: Dict[str, List[Tuple[Path, float]]]
) -> Dict[str, Path]:
    """
    For each angle bucket, select the single best frame based on
    a composite quality score: sharpness × centering × exposure.
    """
    selected: Dict[str, Path] = {}

    for label, candidates in buckets.items():
        if not candidates:
            continue

        if len(candidates) == 1:
            selected[label] = candidates[0][0]
            continue

        # Score each candidate
        best_path = candidates[0][0]
        best_score = -1.0

        for path, sharpness in candidates:
            centering = compute_centering_score(path)
            exposure = compute_exposure_score(path)

            # Composite: sharpness dominates, centering and exposure refine
            composite = sharpness * 0.5 + centering * 0.3 + exposure * 0.2

            if composite > best_score:
                best_score = composite
                best_path = path

        selected[label] = best_path

    logger.info(f"Selected best frames for {len(selected)} angles: {list(selected.keys())}")
    return selected


# ─── Stage 7: Image Normalization ────────────────────────────────────

def normalize_image(
    image_path: Path,
    output_path: Path,
    canvas_size: int = TARGET_CANVAS,
) -> Path:
    """
    Normalize a background-removed image:
      1. Crop to content bounding box
      2. Pad uniformly to square
      3. Resize to target canvas
      4. Center the object
    
    Ensures all directional images are consistently aligned for
    smooth runtime image swapping.
    """
    img = Image.open(image_path).convert("RGBA")
    arr = np.array(img)

    # Find content bounding box from alpha channel
    alpha = arr[:, :, 3]
    rows = np.any(alpha > 30, axis=1)
    cols = np.any(alpha > 30, axis=0)

    if not np.any(rows) or not np.any(cols):
        # No visible content — save as-is
        img.save(output_path, "PNG")
        return output_path

    y_min, y_max = np.where(rows)[0][[0, -1]]
    x_min, x_max = np.where(cols)[0][[0, -1]]

    # Crop to content
    cropped = img.crop((x_min, y_min, x_max + 1, y_max + 1))
    cw, ch = cropped.size

    # Add uniform padding (8% of largest dimension)
    pad = int(max(cw, ch) * 0.08)
    padded_size = max(cw, ch) + pad * 2

    # Create square canvas and center the content
    canvas = Image.new("RGBA", (padded_size, padded_size), (0, 0, 0, 0))
    paste_x = (padded_size - cw) // 2
    paste_y = (padded_size - ch) // 2
    canvas.paste(cropped, (paste_x, paste_y))

    # Resize to target
    canvas = canvas.resize((canvas_size, canvas_size), Image.Resampling.LANCZOS)
    canvas.save(output_path, "PNG", optimize=True)

    return output_path


# ─── Phase 1: Extract angles only (NO background removal) ───────────

def extract_angles_only(
    video_path: Path,
    output_dir: Path,
    item_id: str,
) -> Tuple[List[str], List[str]]:
    """
    Extract the best frame per angle from a 360° video.
    Saves RAW frames (with background) — no bg removal yet.
    
    Returns:
        Tuple of (raw_image_urls, angle_labels)
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix=f"video_extract_{item_id}_"))

    try:
        # Stage 1: Metadata
        logger.info(f"[{item_id}] Stage 1/6: Extracting video metadata...")
        metadata = extract_video_metadata(video_path)

        # Stage 2: Frame extraction
        logger.info(f"[{item_id}] Stage 2/6: Extracting candidate frames...")
        frames_dir = temp_dir / "frames"
        candidate_frames = extract_candidate_frames(video_path, frames_dir)

        # Stage 3: Quality filtering
        logger.info(f"[{item_id}] Stage 3/6: Filtering frame quality...")
        quality_frames = filter_frame_quality(candidate_frames)

        if len(quality_frames) < 4:
            raise ValueError(
                f"Only {len(quality_frames)} quality frames found. "
                "Video may be too blurry or too short."
            )

        # Stage 4: Deduplication
        logger.info(f"[{item_id}] Stage 4/6: Removing duplicate frames...")
        unique_frames = deduplicate_frames(quality_frames)

        # Stage 5: Angle classification
        logger.info(f"[{item_id}] Stage 5/6: Classifying viewing angles...")
        angle_buckets = classify_angles(unique_frames)

        # Stage 6: Best frame selection
        logger.info(f"[{item_id}] Stage 6/6: Selecting best frame per angle...")
        best_frames = select_best_per_angle(angle_buckets)

        if not best_frames:
            raise ValueError("No usable angle frames could be selected.")

        # Save RAW frames (no bg removal) to output dir
        raw_image_urls: List[str] = []
        raw_labels: List[str] = []

        for label, frame_path in best_frames.items():
            # Save as raw_{label}.png (original with background)
            raw_dest = output_dir / f"raw_{label}.png"
            shutil.copy2(frame_path, raw_dest)

            url = f"/uploads/furniture/multiview/{item_id}/raw_{label}.png"
            raw_image_urls.append(url)
            raw_labels.append(label)

        logger.info(
            f"[{item_id}] Extraction complete: {len(raw_labels)} angles — "
            f"{', '.join(raw_labels)}"
        )

        return raw_image_urls, raw_labels

    finally:
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass


# ─── Phase 2: Background removal on extracted angles ────────────────

def process_backgrounds(
    item_id: str,
    output_dir: Path,
    angle_labels: List[str],
) -> Tuple[List[str], List[str]]:
    """
    Run background removal + normalization on raw angle frames.
    
    Expects raw_{label}.png files to already exist in output_dir.
    Produces {label}.png (bg-removed + normalized) files.
    
    Returns:
        Tuple of (processed_image_urls, angle_labels)
    """
    processed_urls: List[str] = []
    processed_labels: List[str] = []

    for label in angle_labels:
        raw_path = output_dir / f"raw_{label}.png"
        if not raw_path.exists():
            logger.warning(f"Raw frame missing for {label}, skipping")
            continue

        # Background removal
        bg_removed_path = output_dir / f"nobg_{label}.png"
        try:
            remove_background(raw_path, bg_removed_path)
        except Exception as e:
            logger.warning(f"BG removal failed for {label}: {e}")
            shutil.copy2(raw_path, bg_removed_path)

        # Normalize (crop, pad, center, resize)
        final_path = output_dir / f"{label}.png"
        normalize_image(bg_removed_path, final_path)

        # Cleanup intermediate
        if bg_removed_path.exists() and bg_removed_path != final_path:
            bg_removed_path.unlink(missing_ok=True)

        url = f"/uploads/furniture/multiview/{item_id}/{label}.png"
        processed_urls.append(url)
        processed_labels.append(label)

    logger.info(
        f"[{item_id}] BG removal complete: {len(processed_labels)} angles processed"
    )
    return processed_urls, processed_labels


# ─── Legacy: Full pipeline (extract + bg removal in one call) ────────

def process_furniture_video(
    video_path: Path,
    output_dir: Path,
    item_id: str,
) -> Tuple[List[str], List[str]]:
    """Full pipeline — extract angles + remove backgrounds in one step."""
    raw_urls, labels = extract_angles_only(video_path, output_dir, item_id)
    processed_urls, processed_labels = process_backgrounds(item_id, output_dir, labels)
    return processed_urls, processed_labels

