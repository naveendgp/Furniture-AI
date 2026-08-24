import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

/* Local filesystem storage behind a tiny abstraction. Files live under
   ./storage and are served via /api/files/[...key]. Swap this module for an
   S3 / Supabase Storage adapter later — the public API (save/url) stays the same. */

const STORAGE_DIR = path.join(process.cwd(), "storage");

export async function saveFile(
  buffer: Buffer,
  opts: { folder: string; filename?: string; ext?: string },
): Promise<{ key: string; url: string }> {
  const ext = opts.ext ?? (opts.filename ? path.extname(opts.filename) : "");
  const name = `${randomUUID()}${ext}`;
  const key = path.posix.join(opts.folder, name);
  const abs = path.join(STORAGE_DIR, key);

  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);

  return { key, url: fileUrl(key) };
}

export function fileUrl(key: string) {
  return `/api/files/${key}`;
}

export async function readFile(key: string): Promise<Buffer | null> {
  const abs = path.join(STORAGE_DIR, key);
  // Prevent path traversal outside the storage root.
  if (!abs.startsWith(STORAGE_DIR)) return null;
  try {
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}

/** Delete a stored file. Accepts a key or a /api/files/<key> URL. Best-effort. */
export async function deleteFile(keyOrUrl: string): Promise<void> {
  const marker = "/api/files/";
  const idx = keyOrUrl.indexOf(marker);
  const key = (idx === -1 ? keyOrUrl : keyOrUrl.slice(idx + marker.length)).split("?")[0];
  const abs = path.join(STORAGE_DIR, key);
  if (!abs.startsWith(STORAGE_DIR)) return;
  try {
    await fs.unlink(abs);
  } catch {
    /* already gone — ignore */
  }
}
