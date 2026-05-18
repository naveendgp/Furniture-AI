"""
AI 3D model generation from images via free Hugging Face Spaces.

Provider priority:
  1. Stable Fast 3D (stabilityai) — fast, outputs GLB directly
  2. TRELLIS (Microsoft) — higher quality, multi-step pipeline
  3. TripoSR (stabilityai) — fallback, often has runtime errors

No API key required for any of these — completely free.
"""

import asyncio
import logging
import shutil
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Provider configs in priority order
PROVIDERS = [
    {
        "name": "Stable Fast 3D",
        "space_id": "stabilityai/stable-fast-3d",
        "method": "_generate_stable_fast_3d",
    },
    {
        "name": "TRELLIS",
        "space_id": "microsoft/TRELLIS",
        "method": "_generate_trellis",
    },
    {
        "name": "TripoSR",
        "space_id": "stabilityai/TripoSR",
        "method": "_generate_triposr",
    },
]


def is_3d_generation_available() -> bool:
    """
    Check if 3D generation is available.
    Always True if gradio_client is installed — we use free HF Spaces.
    """
    try:
        import gradio_client  # noqa: F401
        return True
    except ImportError:
        logger.warning("gradio_client not installed — 3D generation disabled")
        return False


def _generate_stable_fast_3d(image_path: Path, output_dir: Path, item_id: str) -> Optional[str]:
    """
    Generate 3D via Stable Fast 3D (stabilityai).
    Outputs GLB directly — no conversion needed.
    """
    from gradio_client import Client, handle_file

    try:
        logger.info("Stable Fast 3D: Connecting...")
        client = Client("stabilityai/stable-fast-3d", httpx_kwargs={"timeout": 300.0})

        logger.info(f"Stable Fast 3D: Generating from {image_path.name}...")

        # Use /run_button for full control
        result = client.predict(
            input_image=handle_file(str(image_path)),
            foreground_ratio=0.85,
            remesh_option="None",
            vertex_count=-1,
            texture_size=1024,
            api_name="/run_button",
        )

        logger.info(f"Stable Fast 3D: Result = {result}")

        # Result is (preview_image_path, model_file_path)
        model_file = None
        if isinstance(result, (list, tuple)) and len(result) >= 2:
            model_file = result[1]  # Second element is the 3D model
        elif isinstance(result, str):
            model_file = result

        if not model_file:
            logger.error(f"Stable Fast 3D: No model in result: {result}")
            return None

        return _save_model(model_file, output_dir, item_id, "Stable Fast 3D")
    except Exception as e:
        logger.error(f"Stable Fast 3D failed: {str(e)}")
        return None


def _generate_trellis(image_path: Path, output_dir: Path, item_id: str) -> Optional[str]:
    """
    Generate 3D via Microsoft TRELLIS.
    Multi-step: preprocess → generate → extract GLB.
    """
    from gradio_client import Client, handle_file

    try:
        logger.info("TRELLIS: Connecting...")
        client = Client("microsoft/TRELLIS", httpx_kwargs={"timeout": 300.0})

        # Step 1: Start session
        try:
            client.predict(api_name="/start_session")
        except Exception:
            pass  # May not be required

        # Step 2: Preprocess image
        logger.info(f"TRELLIS: Preprocessing {image_path.name}...")
        client.predict(
            image=handle_file(str(image_path)),
            api_name="/preprocess_image",
        )

        # Step 3: Generate 3D asset
        logger.info("TRELLIS: Generating 3D asset...")
        client.predict(
            image=handle_file(str(image_path)),
            multiimages=[],
            seed=42,
            ss_guidance_strength=7.5,
            ss_sampling_steps=12,
            slat_guidance_strength=3.0,
            slat_sampling_steps=12,
            multiimage_algo="stochastic",
            api_name="/image_to_3d",
        )

        # Step 4: Extract GLB
        logger.info("TRELLIS: Extracting GLB...")
        result = client.predict(
            mesh_simplify=0.95,
            texture_size=1024,
            api_name="/extract_glb",
        )

        logger.info(f"TRELLIS: Result = {result}")

        # Result is (model_viewer_path, download_path)
        model_file = None
        if isinstance(result, (list, tuple)):
            for item in result:
                if isinstance(item, str) and item.endswith('.glb'):
                    model_file = item
                    break
            # Try last element
            if not model_file and len(result) >= 1:
                model_file = str(result[-1]) if result[-1] else None
        elif isinstance(result, str):
            model_file = result

        if not model_file:
            logger.error(f"TRELLIS: No GLB in result: {result}")
            return None

        return _save_model(model_file, output_dir, item_id, "TRELLIS")
    except Exception as e:
        logger.error(f"TRELLIS failed: {str(e)}")
        return None


def _generate_triposr(image_path: Path, output_dir: Path, item_id: str) -> Optional[str]:
    """
    Generate 3D via TripoSR (stabilityai).
    Outputs OBJ — requires conversion to GLB.
    """
    from gradio_client import Client, handle_file

    try:
        logger.info("TripoSR: Connecting...")
        client = Client("stabilityai/TripoSR", httpx_kwargs={"timeout": 300.0})

        logger.info(f"TripoSR: Generating from {image_path.name}...")
        result = client.predict(
            handle_file(str(image_path)),
            True,   # do_remove_background
            0.85,   # foreground_ratio
            256,    # mc_resolution
            api_name="/run",
        )

        logger.info(f"TripoSR: Result = {result}")

        model_file = None
        if isinstance(result, (list, tuple)):
            for item in result:
                if isinstance(item, str) and any(item.endswith(ext) for ext in ['.obj', '.glb', '.ply']):
                    model_file = item
                    break
            if not model_file and len(result) > 1:
                model_file = str(result[-1])
        elif isinstance(result, str):
            model_file = result

        if not model_file:
            logger.error(f"TripoSR: No model in result: {result}")
            return None

        return _save_model(model_file, output_dir, item_id, "TripoSR")
    except Exception as e:
        logger.error(f"TripoSR failed: {str(e)}")
        return None


def _save_model(source: str, output_dir: Path, item_id: str, provider: str) -> Optional[str]:
    """
    Save a generated model file as GLB. Converts OBJ/PLY if needed.
    """
    source_path = Path(source)
    if not source_path.exists():
        logger.error(f"{provider}: File doesn't exist: {source}")
        return None

    glb_path = output_dir / f"{item_id}.glb"

    if source_path.suffix.lower() == '.glb':
        # Already GLB — just copy
        shutil.copy2(source_path, glb_path)
        logger.info(f"{provider}: GLB copied directly")
    elif source_path.suffix.lower() in ('.obj', '.ply', '.stl'):
        # Convert to GLB via trimesh
        try:
            import trimesh
            mesh = trimesh.load(str(source_path), force='mesh')
            mesh.export(str(glb_path), file_type='glb')
            logger.info(f"{provider}: Converted {source_path.suffix} → GLB")
        except ImportError:
            logger.error("trimesh not installed — pip install trimesh")
            return None
        except Exception as e:
            logger.error(f"{provider}: Conversion failed: {e}")
            return None
    else:
        logger.error(f"{provider}: Unexpected format: {source_path.suffix}")
        return None

    relative_path = f"/uploads/furniture/models/{item_id}.glb"
    file_size = glb_path.stat().st_size
    logger.info(f"{provider}: Saved {relative_path} ({file_size:,} bytes)")
    return relative_path


def _run_generation_sync(
    image_path: Path,
    output_dir: Path,
    item_id: str,
) -> Optional[str]:
    """
    Try each provider in priority order until one succeeds.
    """
    for provider in PROVIDERS:
        name = provider["name"]
        method_name = provider["method"]
        method = globals()[method_name]

        try:
            logger.info(f"Trying {name}...")
            result = method(image_path, output_dir, item_id)
            if result:
                logger.info(f"✅ {name} succeeded!")
                return result
            else:
                logger.warning(f"❌ {name} returned no result, trying next...")
        except Exception as e:
            err_msg = str(e).split('\n')[0][:150]
            logger.warning(f"❌ {name} failed: {err_msg} — trying next...")
            continue

    logger.error("All 3D generation providers failed")
    return None


async def generate_3d_model(
    image_path: Path,
    output_dir: Path,
    item_id: str,
    timeout_seconds: int = 300,
) -> Optional[str]:
    """
    Generate a 3D GLB model from an image using free Hugging Face Spaces.
    Tries multiple providers in priority order with automatic fallback.

    Args:
        image_path: Local path to the furniture image
        output_dir: Directory to save the generated GLB
        item_id: Unique ID for this furniture item
        timeout_seconds: Max wait time (default 5 min)

    Returns:
        Relative URL path to the saved GLB file, or None if all providers failed
    """
    if not is_3d_generation_available():
        logger.warning("3D generation not available (gradio_client not installed)")
        return None

    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        loop = asyncio.get_event_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                _run_generation_sync,
                image_path,
                output_dir,
                item_id,
            ),
            timeout=timeout_seconds,
        )
        return result

    except asyncio.TimeoutError:
        logger.error(f"3D generation timed out after {timeout_seconds}s")
        return None
    except Exception as e:
        logger.error(f"3D generation unexpected error: {e}", exc_info=True)
        return None
