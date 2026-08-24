"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Video,
  UploadCloud,
  Loader2,
  Check,
  RotateCw,
  Sparkles,
  AlertCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { extractAngles, type Angle } from "@/lib/video-frames";

type Status = "idle" | "extracting" | "review" | "generating" | "done" | "error";

const FRAME_COUNT = 8;
const CATEGORIES = ["Seating", "Tables", "Lighting", "Storage", "Decor"];
const STYLES = ["Modern", "Classical", "Luxury", "Minimal", "Scandinavian"];
const inputCls =
  "w-full h-11 px-3.5 rounded-xl bg-surface border border-border focus:border-primary outline-none text-[15px] transition-colors";

export function VideoExtractor() {
  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState("");
  const [angles, setAngles] = useState<Angle[]>([]);
  const [kept, setKept] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Furniture details (collected here so the real Meshy flow can publish later).
  const [name, setName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [price, setPrice] = useState("");
  const [w, setW] = useState("");
  const [d, setD] = useState("");
  const [h, setH] = useState("");
  const [styles, setStyles] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const toggleStyle = (s: string) =>
    setStyles((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const onPick = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setProgress(0);
    setStatus("extracting");
    try {
      const result = await extractAngles(file, FRAME_COUNT, (done, total) =>
        setProgress(Math.round((done / total) * 100)),
      );
      setAngles(result);
      setKept(new Set(result.map((_, i) => i)));
      setStatus("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
      setStatus("error");
    }
  };

  const toggle = (i: number) =>
    setKept((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // MOCK: in production this uploads the kept angles to Meshy (multi-image → 3D)
  // with these details to create the marketplace product. For now it simulates.
  const generate = () => {
    if (!name.trim() || !price || Number(price) <= 0) {
      setFormError("Please add a furniture name and a price.");
      return;
    }
    setFormError(null);
    setStatus("generating");
    setTimeout(() => setStatus("done"), 2200);
  };

  const reset = () => {
    setStatus("idle");
    setAngles([]);
    setKept(new Set());
    setFileName("");
    setError(null);
    setProgress(0);
    setName("");
    setPrice("");
    setW("");
    setD("");
    setH("");
    setStyles([]);
    setCategory(CATEGORIES[0]);
    setFormError(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-4 rounded-2xl border border-border bg-surface-2">
        <Video className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">360° video → 3D model</p>
          <p className="text-muted mt-0.5">
            Upload one orbit video of a furniture piece. We extract the side
            angles in your browser, you confirm them, then they&apos;re sent to AI
            reconstruction.
          </p>
        </div>
      </div>

      {/* IDLE — upload */}
      {status === "idle" && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full grid place-items-center gap-3 py-16 rounded-3xl border-2 border-dashed border-border-strong hover:border-primary hover:bg-surface-muted/50 transition-all"
          >
            <div className="grid place-items-center h-16 w-16 rounded-2xl bg-surface-muted text-muted">
              <Video className="h-7 w-7" />
            </div>
            <div className="text-center">
              <p className="font-medium text-lg">Upload a 360° video</p>
              <p className="text-subtle text-sm mt-1">
                MP4, MOV or WebM · one full rotation works best
              </p>
            </div>
            <span className="inline-flex items-center gap-2 text-primary font-medium text-sm">
              <UploadCloud className="h-4 w-4" /> Browse files
            </span>
          </button>
        </>
      )}

      {/* EXTRACTING */}
      {status === "extracting" && (
        <div className="grid place-items-center text-center py-16 rounded-2xl border border-border bg-surface">
          <Loader2 className="h-9 w-9 text-primary animate-spin mb-4" />
          <p className="font-medium text-lg">Extracting angles…</p>
          <p className="text-muted text-sm mt-1">{fileName}</p>
          <div className="w-56 h-2 rounded-full bg-surface-muted overflow-hidden mt-5">
            <div className="h-full brand-gradient transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-subtle mt-2">{progress}%</p>
        </div>
      )}

      {/* REVIEW — extracted angles */}
      {status === "review" && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg tracking-tight">
                Extracted {angles.length} angles
              </h3>
              <p className="text-muted text-sm">
                Tap to deselect any blurry or bad frames · {kept.size} selected
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCw className="h-4 w-4" /> New video
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {angles.map((a, i) => {
              const on = kept.has(i);
              return (
                <button
                  key={i}
                  onClick={() => toggle(i)}
                  className={cn(
                    "relative aspect-square rounded-2xl overflow-hidden border-2 transition-all",
                    on
                      ? "border-primary shadow-[var(--shadow-sm)]"
                      : "border-transparent opacity-50 grayscale",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.dataUrl} alt={a.label} className="h-full w-full object-cover" />
                  <span className="absolute top-2 left-2 text-[11px] font-medium glass !border-white/20 text-white px-1.5 py-0.5 rounded-md">
                    {a.label}
                  </span>
                  {on && (
                    <span className="absolute top-2 right-2 grid place-items-center h-5 w-5 rounded-full bg-primary text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Furniture details */}
          <div className="p-5 rounded-2xl border border-border bg-surface-2 space-y-4">
            <p className="font-medium">Furniture details</p>
            <label className="block">
              <span className="text-sm font-medium text-muted mb-1.5 block">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Royale Single-Seater Sofa"
                className={inputCls}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-muted mb-1.5 block">Category</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-muted mb-1.5 block">Price (₹)</span>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="42000"
                  className={inputCls}
                />
              </label>
            </div>
            <div>
              <span className="text-sm font-medium text-muted mb-1.5 block">
                Real dimensions (cm)
              </span>
              <div className="grid grid-cols-3 gap-3">
                <input value={w} onChange={(e) => setW(e.target.value)} placeholder="W" type="number" className={inputCls} />
                <input value={d} onChange={(e) => setD(e.target.value)} placeholder="D" type="number" className={inputCls} />
                <input value={h} onChange={(e) => setH(e.target.value)} placeholder="H" type="number" className={inputCls} />
              </div>
            </div>
            <div>
              <span className="text-sm font-medium text-muted mb-1.5 block">Style tags</span>
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
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-sm">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            
          </div>

          {formError && (
            <p className="text-sm text-rose-500 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" /> {formError}
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={generate} disabled={kept.size === 0}>
              <Sparkles className="h-4 w-4" /> Generate 3D model
            </Button>
          </div>
        </div>
      )}

      {/* GENERATING (mock) */}
      {status === "generating" && (
        <div className="grid place-items-center text-center py-16 rounded-2xl border border-border bg-surface">
          <div className="relative grid place-items-center h-20 w-20 mb-5">
            <div className="absolute inset-0 rounded-full brand-gradient opacity-20 animate-ping" />
            <div className="relative grid place-items-center h-14 w-14 rounded-full brand-gradient text-white">
              <Sparkles className="h-6 w-6" />
            </div>
          </div>
          <p className="font-medium text-lg">Reconstructing 3D model…</p>
          <p className="text-muted text-sm mt-1">
            {kept.size} angles · simulated for now
          </p>
        </div>
      )}

      {/* DONE (mock) */}
      {status === "done" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="grid place-items-center text-center py-14 rounded-2xl border border-border bg-surface"
        >
          <div className="grid place-items-center h-16 w-16 rounded-2xl bg-emerald-500 text-white mb-5">
            <Check className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-semibold tracking-tight">Ready to reconstruct ✓</h3>
          <p className="text-muted mt-1.5 max-w-md">
            {kept.size} angles of <span className="font-medium text-foreground">{name || "your furniture"}</span>{" "}
            ({category}{price ? ` · ₹${Number(price).toLocaleString("en-IN")}` : ""}) 
          </p>
          <Button variant="secondary" className="mt-6" onClick={reset}>
            Process another video
          </Button>
        </motion.div>
      )}

      {/* ERROR */}
      {status === "error" && (
        <div className="grid place-items-center text-center py-14 rounded-2xl border border-border bg-surface">
          <div className="grid place-items-center h-14 w-14 rounded-2xl bg-rose-500/10 text-rose-500 mb-4">
            <AlertCircle className="h-7 w-7" />
          </div>
          <p className="font-medium text-lg">Couldn&apos;t process the video</p>
          <p className="text-muted text-sm mt-1 max-w-sm">{error}</p>
          <Button variant="secondary" className="mt-5" onClick={reset}>
            Try another video
          </Button>
        </div>
      )}
    </div>
  );
}
