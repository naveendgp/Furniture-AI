/* Real, in-browser 360° frame extraction.
   Loads the vendor's video, seeks to evenly-spaced timestamps, and captures a
   frame at each — these are the "side angles" as the object rotates. No server
   or upload needed for extraction; it all runs on a <video> + <canvas>. */

export type Angle = { label: string; dataUrl: string };

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = Math.min(Math.max(time, 0), video.duration - 0.01);
  });
}

export async function extractAngles(
  file: File,
  count = 8,
  onProgress?: (done: number, total: number) => void,
): Promise<Angle[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () =>
        reject(new Error("Couldn't read this video — try MP4, MOV or WebM."));
    });

    const duration = video.duration;
    if (!isFinite(duration) || duration <= 0) {
      throw new Error("Couldn't determine the video length.");
    }

    // Downscale captured frames to keep them light.
    const maxDim = 640;
    const ratio = Math.min(
      1,
      maxDim / Math.max(video.videoWidth, video.videoHeight),
    );
    const w = Math.round(video.videoWidth * ratio);
    const h = Math.round(video.videoHeight * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available.");

    const angles: Angle[] = [];
    for (let i = 0; i < count; i++) {
      const t = (duration * (i + 0.5)) / count; // sample the middle of each slice
      await seek(video, t);
      ctx.drawImage(video, 0, 0, w, h);
      angles.push({
        label: `${Math.round((i / count) * 360)}°`,
        dataUrl: canvas.toDataURL("image/jpeg", 0.85),
      });
      onProgress?.(i + 1, count);
    }
    return angles;
  } finally {
    URL.revokeObjectURL(url);
  }
}
