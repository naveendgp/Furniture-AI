/* Vanishing-point estimation for the room photo.
   An architect's cue: the room's receding floor/ceiling/wall lines converge to a
   vanishing point whose horizontal offset reveals the camera's yaw relative to
   the walls. We use that to auto-orient furniture "square to the room" on
   placement, instead of a noisy depth-gradient guess.

   Pipeline (all in-browser, no deps): downscale → Sobel edges → keep the
   diagonal "receding" edges → RANSAC for the point most lines pass through →
   convert its screen offset to a camera yaw. Best-effort: returns a confidence so
   the caller can fall back to facing the camera when the room is inconclusive. */

export type VanishingResult = { yawDeg: number; confidence: number };

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

type Edge = { x: number; y: number; nx: number; ny: number; c: number };

export async function estimateRoomYaw(
  imageUrl: string,
  fovDeg: number,
): Promise<VanishingResult> {
  const img = await loadImage(imageUrl);
  const W = 320;
  const H = Math.max(1, Math.round((img.height / img.width) * W));

  const cvs = document.createElement("canvas");
  cvs.width = W;
  cvs.height = H;
  const ctx = cvs.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { yawDeg: 0, confidence: 0 };
  ctx.drawImage(img, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  // Sobel → keep diagonal (receding) edges only. Vertical & horizontal lines
  // don't reveal yaw; the room's depth lines are the tilted diagonals.
  const edges: Edge[] = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx =
        -gray[i - W - 1] - 2 * gray[i - 1] - gray[i + W - 1] +
        gray[i - W + 1] + 2 * gray[i + 1] + gray[i + W + 1];
      const gy =
        -gray[i - W - 1] - 2 * gray[i - W] - gray[i - W + 1] +
        gray[i + W - 1] + 2 * gray[i + W] + gray[i + W + 1];
      const mag = Math.hypot(gx, gy);
      if (mag < 70) continue;
      // Line direction is perpendicular to the gradient. Its screen angle from
      // horizontal tells us if it's a useful receding diagonal.
      const lineAngle = Math.atan2(-gx, gy); // dir = grad + 90°
      let deg = Math.abs((lineAngle * 180) / Math.PI) % 180;
      if (deg > 90) deg = 180 - deg; // fold to 0..90 from horizontal
      if (deg < 8 || deg > 55) continue; // skip near-horizontal & near-vertical
      const nx = gx / mag;
      const ny = gy / mag;
      edges.push({ x, y, nx, ny, c: nx * x + ny * y });
    }
  }

  if (edges.length < 40) return { yawDeg: 0, confidence: 0 };

  // Sub-sample for speed.
  const pool =
    edges.length > 1500
      ? edges.filter((_, k) => k % Math.ceil(edges.length / 1500) === 0)
      : edges;

  // RANSAC: the vanishing point is where the most receding lines intersect.
  const EPS = 2.5;
  let bestInliers = 0;
  let bestVP: { x: number; y: number } | null = null;
  const iters = 320;
  for (let it = 0; it < iters; it++) {
    const a = pool[(Math.random() * pool.length) | 0];
    const b = pool[(Math.random() * pool.length) | 0];
    const det = a.nx * b.ny - a.ny * b.nx;
    if (Math.abs(det) < 1e-4) continue;
    const px = (a.c * b.ny - b.c * a.ny) / det;
    const py = (a.nx * b.c - b.nx * a.c) / det;
    // VP should be roughly on/near the horizon band, not wildly far vertically.
    if (!isFinite(px) || !isFinite(py)) continue;
    if (py < -H * 1.5 || py > H * 2.5) continue;
    let inliers = 0;
    for (let k = 0; k < pool.length; k++) {
      const e = pool[k];
      if (Math.abs(e.nx * px + e.ny * py - e.c) < EPS) inliers++;
    }
    if (inliers > bestInliers) {
      bestInliers = inliers;
      bestVP = { x: px, y: py };
    }
  }

  if (!bestVP) return { yawDeg: 0, confidence: 0 };

  // VP horizontal offset → camera yaw.
  const ndcX = (bestVP.x / W) * 2 - 1;
  const aspect = W / H;
  const fovV = (fovDeg * Math.PI) / 180;
  const tanH = Math.tan(fovV / 2) * aspect;
  let yaw = (Math.atan(ndcX * tanH) * 180) / Math.PI;
  yaw = Math.max(-40, Math.min(40, yaw));

  const confidence = bestInliers / pool.length;
  return { yawDeg: yaw, confidence };
}
