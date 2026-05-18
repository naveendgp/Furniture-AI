'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, UploadCloud, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { useRoomStore } from '@/stores/roomStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function RoomUploadDialog({ open, onClose }: Props) {
  const { uploadRoom, loading } = useRoomStore();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  
  // Room dimensions
  const [roomWidth, setRoomWidth] = useState(12);
  const [roomLength, setRoomLength] = useState(15);
  const [roomHeight, setRoomHeight] = useState(9);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  const onFileSelect = useCallback((f: File) => {
    if (!f.type.startsWith('image/')) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }, [preview]);

  const resetState = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setDragging(false);
  }, [preview]);

  const handleClose = () => {
    if (loading) return;
    resetState();
    onClose();
  };

  const handleSubmit = async () => {
    if (!file || loading) return;
    try {
      const widthCm = roomWidth * 30.48;
      const lengthCm = roomLength * 30.48;
      await uploadRoom(file, widthCm, lengthCm);
      resetState();
      onClose();
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-5">

          {/* BACKDROP */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/50"
            style={{ backdropFilter: 'blur(6px)' }}
          />

          {/* DIALOG */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Set room photo"
            initial={{ opacity: 0, scale: 0.97, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 14 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="dialog-root relative flex w-full max-w-[400px] flex-col overflow-hidden"
          >

            {/* HEADER */}
            <div className="dialog-header flex items-start justify-between px-7 pt-7 pb-5">
              <div>
                <p className="dialog-eyebrow">Room setup</p>
                <h2 className="dialog-title">Add a photo</h2>
                <p className="dialog-subtitle">Upload a photo to start visualizing your space</p>
              </div>
              <button
                onClick={handleClose}
                disabled={loading}
                className="close-btn shrink-0 mt-0.5 ml-4"
                aria-label="Close dialog"
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>

            {/* DIVIDER */}
            <div className="dialog-divider" />

            {/* BODY */}
            <div className="flex flex-col gap-5 px-7 py-6">

              {/* ROOM INPUTS */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[11px] text-white/70 font-semibold mb-2 uppercase">Room Width</p>
                  <div className="relative">
                    <input type="number" min={1} value={roomWidth} onChange={(e) => setRoomWidth(Number(e.target.value) || 12)} className="w-full py-2.5 px-3 text-[14px] bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-blue-500/50 transition-colors" />
                    <span className="absolute right-3 top-2.5 text-[12px] text-white/30 font-medium pointer-events-none">ft</span>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-white/70 font-semibold mb-2 uppercase">Room Length</p>
                  <div className="relative">
                    <input type="number" min={1} value={roomLength} onChange={(e) => setRoomLength(Number(e.target.value) || 15)} className="w-full py-2.5 px-3 text-[14px] bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-blue-500/50 transition-colors" />
                    <span className="absolute right-3 top-2.5 text-[12px] text-white/30 font-medium pointer-events-none">ft</span>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-white/70 font-semibold mb-2 uppercase">Room Height</p>
                  <div className="relative">
                    <input type="number" min={1} value={roomHeight} onChange={(e) => setRoomHeight(Number(e.target.value) || 9)} className="w-full py-2.5 px-3 text-[14px] bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-blue-500/50 transition-colors" />
                    <span className="absolute right-3 top-2.5 text-[12px] text-white/30 font-medium pointer-events-none">ft</span>
                  </div>
                </div>
              </div>

              {/* DROPZONE */}
              <div
                onClick={() => !loading && inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) onFileSelect(f);
                }}
                className={`dropzone group relative flex h-[200px] w-full cursor-pointer flex-col items-center justify-center overflow-hidden transition-all duration-200 ${
                  preview
                    ? 'dropzone--filled'
                    : dragging
                    ? 'dropzone--dragging'
                    : 'dropzone--empty'
                }`}
              >
                {preview ? (
                  <>
                    <img
                      src={preview}
                      alt="Room preview"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <div className="dropzone-overlay absolute inset-0 flex flex-col items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      <div className="replace-pill flex items-center gap-2 px-4 py-2">
                        <UploadCloud size={13} strokeWidth={2} />
                        <span>Replace photo</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="upload-icon-wrap flex h-12 w-12 items-center justify-center transition-transform duration-200 group-hover:scale-105">
                      <UploadCloud size={20} strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="upload-title">Drop your photo here</p>
                      <p className="upload-hint mt-1">or click to browse · JPG, PNG, WEBP</p>
                    </div>
                  </div>
                )}
              </div>

              {/* AI BADGE */}
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="ai-badge ai-badge--loading flex items-center gap-3"
                  >
                    <Loader2 size={13} strokeWidth={2} className="animate-spin shrink-0" />
                    <span>Analyzing depth, perspective & floor plane…</span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="ai-badge ai-badge--idle flex items-center gap-3"
                  >
                    <Sparkles size={13} strokeWidth={2} className="shrink-0" />
                    <span>AI auto-detects floor plane, depth map & 3D perspective</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* DIVIDER */}
            <div className="dialog-divider" />

            {/* FOOTER */}
            <div className="flex items-center gap-3 px-7 py-5">
              <button
                onClick={handleClose}
                disabled={loading}
                className="btn btn--ghost flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!file || loading}
                className="btn btn--primary flex flex-1 items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 size={13} strokeWidth={2} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={13} strokeWidth={2} />
                )}
                {loading ? 'Processing…' : 'Set as room'}
              </button>
            </div>

          </motion.div>

          {/* STYLES — all values sourced from global CSS tokens */}
          <style>{`
            .dialog-root {
              background: var(--c-surface-1);
              border-radius: var(--r-2xl);
              border: 1px solid var(--c-border-md);
              box-shadow: var(--sh-modal);
              padding: 10px;
            }

            .dialog-eyebrow {
              font-size: 10px;
              font-weight: 700;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              color: var(--c-accent);
              margin: 0 0 6px;
            }

            .dialog-title {
              font-size: 18px;
              font-weight: 600;
              color: var(--c-txt-1);
              margin: 0 0 3px;
              line-height: 1.25;
            }

            .dialog-subtitle {
              font-size: 12.5px;
              color: var(--c-txt-2);
              margin: 0;
              line-height: 1.5;
            }

            .dialog-divider {
              height: 1px;
              background: var(--c-border);
            }

            .close-btn {
              display: flex;
              align-items: center;
              justify-content: center;
              width: 30px;
              height: 30px;
              border-radius: var(--r-sm);
              border: 1px solid var(--c-border);
              background: transparent;
              color: var(--c-txt-3);
              cursor: pointer;
              transition: background 0.15s, color 0.15s;
            }
            .close-btn:hover { background: rgba(255,255,255,0.06); color: var(--c-txt-1); }
            .close-btn:disabled { opacity: 0.35; cursor: not-allowed; }

            .dropzone {
              border-radius: var(--r-lg);
              border: 1px dashed;
            }
            .dropzone--empty {
              border-color: var(--c-border-md);
              background: var(--c-surface-2);
            }
            .dropzone--empty:hover {
              border-color: var(--c-accent);
              background: var(--c-accent-glow);
            }
            .dropzone--dragging {
              border-color: var(--c-accent);
              background: var(--c-accent-glow);
            }
            .dropzone--filled {
              border-color: transparent;
              border-style: solid;
            }

            .dropzone-overlay {
              background: rgba(0,0,0,0.55);
              backdrop-filter: blur(4px);
              border-radius: calc(var(--r-lg) - 1px);
            }

            .replace-pill {
              border-radius: var(--r-pill);
              background: var(--c-surface-3);
              border: 1px solid var(--c-border-md);
              font-size: 12px;
              font-weight: 600;
              color: var(--c-txt-1);
            }

            .upload-icon-wrap {
              width: 48px;
              height: 48px;
              border-radius: var(--r-md);
              background: var(--c-surface-3);
              border: 1px solid var(--c-border);
              color: var(--c-accent);
            }

            .upload-title {
              font-size: 13px;
              font-weight: 600;
              color: var(--c-txt-1);
              margin: 0;
            }

            .upload-hint {
              font-size: 11.5px;
              color: var(--c-txt-3);
              margin: 0;
            }

            .ai-badge {
              padding: 10px 14px;
              border-radius: var(--r-md);
              font-size: 12px;
              line-height: 1.4;
            }
            .ai-badge--idle {
              background: var(--c-surface-2);
              border: 1px solid var(--c-border);
              color: var(--c-txt-2);
            }
            .ai-badge--idle svg { color: var(--c-accent); }
            .ai-badge--loading {
              background: var(--c-accent-glow);
              border: 1px solid rgba(59,130,246,0.2);
              color: var(--c-accent);
            }

            /* Reuse global button classes — just add flex + sizing tweaks */
            .btn--ghost  { flex: 1; height: 38px; }
            .btn--primary { flex: 1; height: 38px; }
          `}</style>

          {/* HIDDEN INPUT */}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) onFileSelect(selected);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </AnimatePresence>
  );
}