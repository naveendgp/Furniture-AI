"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Images, Wand2, Download, ArrowLeftRight, Loader2, Trash2 } from "lucide-react";
import { Page } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { RenderDTO } from "@/lib/types";

export default function GalleryPage() {
  const [renders, setRenders] = useState<RenderDTO[] | null>(null);
  const [active, setActive] = useState<RenderDTO | null>(null);

  useEffect(() => {
    api
      .renders()
      .then(setRenders)
      .catch(() => setRenders([]));
  }, []);

  const remove = (r: RenderDTO) => {
    if (!window.confirm(`Delete this render of "${r.projectName}"? This can't be undone.`)) return;
    setRenders((prev) => (prev ? prev.filter((x) => x.id !== r.id) : prev));
    setActive((a) => (a?.id === r.id ? null : a));
    api.deleteRender(r.id).catch(() => {});
  };

  return (
    <Page>
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Render Gallery</h1>
          <p className="text-muted mt-1.5">
            Photorealistic renders of your designs, with before / after comparisons
          </p>
        </div>
        <Link href="/studio">
          <Button variant="outline" size="sm">
            <Wand2 className="h-4 w-4" /> Open Studio
          </Button>
        </Link>
      </div>

      {renders === null ? (
        <div className="grid place-items-center py-24 text-muted">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : renders.length === 0 ? (
        <div className="grid place-items-center text-center py-24 rounded-3xl border border-dashed border-border-strong bg-surface/50">
          <div className="grid place-items-center h-20 w-20 rounded-3xl bg-surface-muted mb-5">
            <Images className="h-9 w-9 text-subtle" />
          </div>
          <h3 className="text-xl font-semibold tracking-tight">No renders yet</h3>
          <p className="text-muted mt-1.5 max-w-md">
            Design a room in the studio and hit <span className="font-medium">Render Scene</span>{" "}
            to generate a photorealistic image. Your renders appear here to compare,
            download, and share.
          </p>
          <Link href="/studio" className="mt-6">
            <Button>
              <Wand2 className="h-4 w-4" /> Open Design Studio
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {renders.map((r) => (
            <div key={r.id} className="relative group">
              <button
                onClick={() => setActive(r)}
                className="w-full text-left rounded-2xl border border-border bg-surface overflow-hidden hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all"
              >
                <div className="relative aspect-[4/3] bg-surface-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.afterUrl} alt={`Render of ${r.projectName}`} className="h-full w-full object-cover" loading="lazy" />
                  <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/55 text-white px-1.5 py-0.5 text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowLeftRight className="h-3 w-3" /> Before / After
                  </span>
                </div>
                <div className="p-3.5">
                  <p className="text-sm font-semibold truncate">{r.projectName}</p>
                  <p className="text-xs text-subtle mt-0.5">{formatDate(r.createdAt)}</p>
                </div>
              </button>
              <button
                onClick={() => remove(r)}
                aria-label="Delete render"
                title="Delete render"
                className="absolute top-2 left-2 grid place-items-center h-8 w-8 rounded-lg bg-black/55 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {active && (
        <RenderViewer render={active} onClose={() => setActive(null)} onDelete={() => remove(active)} />
      )}
    </Page>
  );
}

function RenderViewer({ render, onClose, onDelete }: { render: RenderDTO; onClose: () => void; onDelete: () => void }) {
  const [showBefore, setShowBefore] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl rounded-3xl bg-surface border border-border overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-border">
          <div className="min-w-0">
            <p className="font-semibold truncate">{render.projectName}</p>
            <p className="text-xs text-subtle">{formatDate(render.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onDelete}
              aria-label="Delete render"
              title="Delete render"
              className="grid place-items-center h-9 w-9 rounded-lg text-muted hover:bg-red-500/10 hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <Button variant="outline" size="sm" onClick={() => setShowBefore((v) => !v)}>
              <ArrowLeftRight className="h-4 w-4" /> {showBefore ? "Show after" : "Show before"}
            </Button>
            <a href={render.afterUrl} download={`${render.projectName}-render.png`}>
              <Button size="sm">
                <Download className="h-4 w-4" /> Download
              </Button>
            </a>
          </div>
        </div>
        <div className="relative bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={showBefore ? render.beforeUrl : render.afterUrl}
            alt={showBefore ? "Before" : "After"}
            className="w-full max-h-[75vh] object-contain"
          />
          <span className="absolute top-3 left-3 rounded-md bg-black/60 text-white px-2 py-1 text-xs font-medium">
            {showBefore ? "Before" : "After — AI render"}
          </span>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
