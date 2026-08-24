/* Room depth field via Depth Anything V2 (runs in-browser through
   transformers.js — no API key, no server). Produces a per-pixel "nearness"
   map (1 = closest to camera, 0 = farthest) that the studio samples at the drop
   point to seat furniture on the real floor with correct perspective. */

export type DepthField = {
  width: number;
  height: number;
  near: Float32Array; // 0..1, 1 = closest
  /** Sample nearness at a normalized anchor (ax, ay ∈ [0,1]); 3×3 median. */
  sample: (ax: number, ay: number) => number;
  /** Estimated room yaw (°): how the floor recedes vs straight-on (0 = square to camera). */
  roomYawDeg: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipePromise: Promise<any> | null = null;
const cache = new Map<string, Promise<DepthField>>();

async function getPipe() {
  if (!pipePromise) {
    pipePromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      return pipeline("depth-estimation", "onnx-community/depth-anything-v2-small");
    })();
  }
  return pipePromise;
}

export function getDepthField(imageUrl: string): Promise<DepthField> {
  let existing = cache.get(imageUrl);
  if (!existing) {
    existing = build(imageUrl);
    cache.set(imageUrl, existing);
  }
  return existing;
}

async function build(imageUrl: string): Promise<DepthField> {
  const pipe = await getPipe();
  const out = await pipe(imageUrl);
  const depth = out.depth as {
    data: Uint8Array | Uint8ClampedArray;
    width: number;
    height: number;
    channels?: number;
  };
  const { data, width, height } = depth;
  const ch = depth.channels ?? 1;

  // Depth-Anything encodes closer = brighter. Convert to nearness 0..1.
  const near = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) near[i] = data[i * ch] / 255;

  // Robustness: if the bottom of the image isn't "nearer" than the top, the
  // convention is flipped — invert so the floor (bottom) reads as near.
  const bandAvg = (a: number, b: number) => {
    let s = 0;
    let n = 0;
    const y0 = Math.floor(height * a);
    const y1 = Math.floor(height * b);
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < width; x++) {
        s += near[y * width + x];
        n++;
      }
    return s / Math.max(1, n);
  };
  if (bandAvg(0.8, 1.0) < bandAvg(0.0, 0.2)) {
    for (let i = 0; i < near.length; i++) near[i] = 1 - near[i];
  }

  const sample = (ax: number, ay: number) => {
    const px = Math.min(width - 1, Math.max(0, Math.round(ax * width)));
    const py = Math.min(height - 1, Math.max(0, Math.round(ay * height)));
    const vals: number[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = Math.min(width - 1, Math.max(0, px + dx));
        const y = Math.min(height - 1, Math.max(0, py + dy));
        vals.push(near[y * width + x]);
      }
    vals.sort((a, b) => a - b);
    return vals[4]; // median of 9
  };

  // Estimate room yaw from the floor's depth gradient in a lower-central band.
  // If depth recedes straight up the image → square-on (0°); a sideways skew
  // means the camera views the room at an angle.
  let sgx = 0;
  let sgy = 0;
  let gn = 0;
  const gy0 = Math.floor(height * 0.55);
  const gy1 = Math.floor(height * 0.92);
  const gx0 = Math.floor(width * 0.25);
  const gx1 = Math.floor(width * 0.75);
  for (let y = gy0; y < gy1; y++)
    for (let x = gx0; x < gx1; x++) {
      sgx += near[y * width + (x + 1)] - near[y * width + (x - 1)];
      sgy += near[(y + 1) * width + x] - near[(y - 1) * width + x];
      gn++;
    }
  const gx = sgx / Math.max(1, gn);
  const gy = sgy / Math.max(1, gn);
  // "into the room" = direction of decreasing nearness (screen: x right, y down).
  const inX = -gx;
  const inY = -gy;
  let roomYawDeg = (Math.atan2(inX, -inY) * 180) / Math.PI;
  if (!isFinite(roomYawDeg)) roomYawDeg = 0;
  roomYawDeg = Math.max(-40, Math.min(40, roomYawDeg));

  return { width, height, near, sample, roomYawDeg };
}
