"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Box,
  ImageIcon,
  Video,
  Check,
  Loader2,
  UploadCloud,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Style } from "@/lib/types";

// R3F front-picker — client-only.
const FrontPicker = dynamic(
  () => import("@/components/settings/front-picker").then((m) => m.FrontPicker),
  { ssr: false },
);

const CATEGORIES = ["Seating", "Tables", "Lighting", "Storage", "Decor"];
const STYLES: Style[] = ["Modern", "Classical", "Luxury", "Minimal", "Scandinavian"];

async function uploadFile(file: File, folder: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", folder);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error("File upload failed");
  return (await res.json()).url as string;
}

export function ModelUpload() {
  const [glb, setGlb] = useState<File | null>(null);
  const [glbPreview, setGlbPreview] = useState<string | null>(null);
  const [thumb, setThumb] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [video, setVideo] = useState<File | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [price, setPrice] = useState("");
  const [styles, setStyles] = useState<Style[]>([]);
  const [w, setW] = useState("");
  const [d, setD] = useState("");
  const [h, setH] = useState("");
  const [description, setDescription] = useState("");
  const [frontYaw, setFrontYaw] = useState(0);
  const [mount, setMount] = useState<"floor" | "ceiling">("floor");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const glbRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const onGlb = (f: File | null) => {
    setGlb(f);
    setGlbPreview(f ? URL.createObjectURL(f) : null);
  };
  const onThumb = (f: File | null) => {
    setThumb(f);
    setThumbPreview(f ? URL.createObjectURL(f) : null);
  };

  const toggleStyle = (s: Style) =>
    setStyles((cur) =>
      cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
    );

  const valid = glb && thumb && name.trim() && price && Number(price) > 0;

  const submit = async () => {
    if (!valid) {
      setError("Please add a GLB, a thumbnail, a name and a price.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const modelUrl = await uploadFile(glb!, "models");
      const thumbnailUrl = await uploadFile(thumb!, "thumbnails");
      const sourceVideoUrl = video ? await uploadFile(video, "videos") : undefined;

      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          priceInr: Number(price),
          styleTags: styles,
          widthCm: w ? Number(w) : undefined,
          depthCm: d ? Number(d) : undefined,
          heightCm: h ? Number(h) : undefined,
          description: description.trim() || undefined,
          modelUrl,
          thumbnailUrl,
          sourceVideoUrl,
          frontYaw,
          mount,
          status: "READY",
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setGlb(null); setGlbPreview(null); setThumb(null); setThumbPreview(null);
    setVideo(null); setName(""); setPrice(""); setStyles([]);
    setW(""); setD(""); setH(""); setDescription(""); setDone(false); setError(null);
    setFrontYaw(0);
    setMount("floor");
  };

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="grid place-items-center text-center py-16 rounded-2xl border border-border bg-surface"
      >
        <div className="grid place-items-center h-16 w-16 rounded-2xl bg-emerald-500 text-white mb-5">
          <Check className="h-8 w-8" />
        </div>
        <h3 className="text-xl font-semibold tracking-tight">Added to marketplace</h3>
        <p className="text-muted mt-1.5 max-w-sm">
          “{name}” is now live in the Furniture Library and ready to place in rooms.
        </p>
        <div className="flex gap-3 mt-6">
          <Button variant="secondary" onClick={reset}>
            Upload another
          </Button>
          <Link href="/library">
            <Button>
              View in Library <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-4 rounded-2xl border border-border bg-surface-2">
        <Box className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">Manual 3D model upload</p>
          <p className="text-muted mt-0.5">
            Generate the model in Meshy&apos;s web app, download the textured{" "}
            <code className="text-xs px-1 py-0.5 rounded bg-surface-muted">.glb</code>, and
            upload it here. Next month this becomes automatic via the Meshy API.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: GLB + preview */}
        <div className="space-y-4">
          <input
            ref={glbRef}
            type="file"
            accept=".glb,model/gltf-binary"
            className="hidden"
            onChange={(e) => onGlb(e.target.files?.[0] ?? null)}
          />
          {glbPreview ? (
            <div className="rounded-2xl border border-border bg-surface-muted overflow-hidden">
              <div className="relative aspect-square w-full">
                <FrontPicker url={glbPreview} yaw={frontYaw} />
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[11px] font-medium glass border border-border rounded-full px-2.5 py-1 text-muted pointer-events-none">
                  ↑ this side faces the viewer
                </span>
              </div>
              <div className="px-4 py-3 border-t border-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500" /> {glb?.name}
                  </span>
                  <button
                    onClick={() => glbRef.current?.click()}
                    className="text-sm text-primary font-medium"
                  >
                    Replace
                  </button>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium">Set the front</span>
                    <span className="text-sm text-muted">{frontYaw}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={359}
                    step={1}
                    value={frontYaw}
                    onChange={(e) => setFrontYaw(Number(e.target.value))}
                    className="w-full accent-[var(--primary)]"
                    aria-label="Set front rotation"
                  />
                  <p className="text-xs text-subtle mt-1">
                    Rotate until the front of the piece faces you — the studio uses
                    this to auto-orient it in the room.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => glbRef.current?.click()}
              className="w-full grid place-items-center gap-3 aspect-square rounded-2xl border-2 border-dashed border-border-strong hover:border-primary hover:bg-surface-muted/50 transition-all"
            >
              <div className="grid place-items-center h-16 w-16 rounded-2xl bg-surface-muted text-muted">
                <Box className="h-7 w-7" />
              </div>
              <div className="text-center">
                <p className="font-medium">Upload 3D model (.glb)</p>
                <p className="text-subtle text-sm mt-1">Drag &amp; drop or browse</p>
              </div>
              <span className="inline-flex items-center gap-2 text-primary font-medium text-sm">
                <UploadCloud className="h-4 w-4" /> Browse files
              </span>
            </button>
          )}

          {/* Optional source video */}
          <input
            ref={videoRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => videoRef.current?.click()}
            className="flex items-center gap-3 w-full p-3.5 rounded-xl border border-border bg-surface hover:bg-surface-muted transition-colors text-left"
          >
            <Video className="h-5 w-5 text-muted shrink-0" />
            <span className="text-sm flex-1 truncate">
              {video ? video.name : "Attach source 360° video (optional)"}
            </span>
            {video && <Check className="h-4 w-4 text-emerald-500" />}
          </button>
        </div>

        {/* Right: metadata */}
        <div className="space-y-4">
          {/* Thumbnail */}
          <input
            ref={thumbRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onThumb(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => thumbRef.current?.click()}
            className="flex items-center gap-3 w-full p-3 rounded-xl border border-border bg-surface hover:bg-surface-muted transition-colors text-left"
          >
            {thumbPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbPreview} alt="" className="h-12 w-12 rounded-lg object-cover" />
            ) : (
              <span className="grid place-items-center h-12 w-12 rounded-lg bg-surface-muted text-muted">
                <ImageIcon className="h-5 w-5" />
              </span>
            )}
            <span className="text-sm flex-1">
              <span className="font-medium block">
                {thumb ? thumb.name : "Marketplace thumbnail"}
              </span>
              <span className="text-subtle">Product photo · required</span>
            </span>
          </button>

          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Verona Accent Chair"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputCls}
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Price (₹)">
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="32000"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Placement — where the piece attaches in the room">
            <div className="grid grid-cols-2 gap-2">
              {(["floor", "ceiling"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMount(m)}
                  className={cn(
                    "h-11 rounded-xl border text-sm font-medium capitalize transition-all",
                    mount === m
                      ? "brand-gradient text-white border-transparent"
                      : "bg-surface text-muted border-border hover:bg-surface-muted",
                  )}
                >
                  {m === "ceiling" ? "Ceiling (hangs down)" : "Floor"}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Real dimensions (cm) — used for correct scale in rooms">
            <div className="grid grid-cols-3 gap-3">
              <input value={w} onChange={(e) => setW(e.target.value)} placeholder="W" type="number" className={inputCls} />
              <input value={d} onChange={(e) => setD(e.target.value)} placeholder="D" type="number" className={inputCls} />
              <input value={h} onChange={(e) => setH(e.target.value)} placeholder="H" type="number" className={inputCls} />
            </div>
          </Field>

          <Field label="Style tags">
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStyle(s)}
                  className={cn(
                    "h-9 px-3.5 rounded-full text-sm font-medium border transition-all",
                    styles.includes(s)
                      ? "brand-gradient text-white border-transparent"
                      : "bg-surface text-muted border-border hover:bg-surface-muted",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-rose-500">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
        <Button variant="ghost" onClick={reset} disabled={submitting}>
          Clear
        </Button>
        <Button onClick={submit} disabled={!valid || submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Publishing…
            </>
          ) : (
            <>
              <UploadCloud className="h-4 w-4" /> Publish to marketplace
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full h-11 px-3.5 rounded-xl bg-surface border border-border focus:border-primary outline-none text-[15px] transition-colors";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
