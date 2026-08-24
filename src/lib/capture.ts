/* Composite the room photo + the WebGL furniture overlay into a single image that
   matches exactly what the user sees on screen (object-cover photo, transparent
   3D canvas drawn on top). Shared by the render dialog and AI placement — both
   need "the scene as it looks right now" as a JPEG data URL.

   Browser-only (uses <canvas>/<img>); import from client components. */

/** Draw the room photo object-cover into a `w×h` canvas (matches the on-screen view). */
async function drawPhotoCover(
  ctx: CanvasRenderingContext2D,
  photoUrl: string,
  w: number,
  h: number,
): Promise<void> {
  const img = new Image();
  img.src = photoUrl;
  await img.decode();
  const ir = img.width / img.height;
  const cr = w / h;
  let dw = w;
  let dh = h;
  if (ir > cr) {
    dh = h;
    dw = h * ir;
  } else {
    dw = w;
    dh = w / ir;
  }
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function stageSize(stageEl: HTMLElement): { w: number; h: number } {
  const canvas = stageEl.querySelector("canvas");
  const w = canvas?.clientWidth || stageEl.clientWidth;
  const h = canvas?.clientHeight || stageEl.clientHeight;
  return { w, h };
}

export async function captureComposite(
  stageEl: HTMLElement,
  photoUrl: string,
): Promise<string> {
  const canvas = stageEl.querySelector("canvas");
  if (!canvas) throw new Error("Scene canvas not found");
  const { w, h } = stageSize(stageEl);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");

  await drawPhotoCover(ctx, photoUrl, w, h);
  // The WebGL canvas is transparent except for the furniture — draw it on top.
  ctx.drawImage(canvas, 0, 0, w, h);

  return out.toDataURL("image/jpeg", 0.92);
}

/** Photo-only view (no 3D furniture) in stage coordinates — for segmenting the
    REAL room objects so their boxes align with the placement anchor space. */
export async function capturePhotoView(
  stageEl: HTMLElement,
  photoUrl: string,
): Promise<string> {
  const { w, h } = stageSize(stageEl);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  await drawPhotoCover(ctx, photoUrl, w, h);
  return out.toDataURL("image/jpeg", 0.92);
}
