'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, UploadCloud, Video, Loader2, CheckCircle2, AlertTriangle, Play, RefreshCw, ImagePlus, ArrowRight } from 'lucide-react';
import { useFurnitureStore } from '@/stores/furnitureStore';
import { FURNITURE_CATEGORIES, FurnitureCategory } from '@/types';
import { replaceAngleImage, assetUrl } from '@/lib/api';

interface Props { open: boolean; onClose: () => void; }

const EXTRACT_STAGES = [
  'Extracting video metadata...', 'Extracting candidate frames...',
  'Filtering frame quality...', 'Removing duplicate frames...',
  'Classifying viewing angles...', 'Selecting best frame per angle...',
];

const ALL_ANGLES = [
  { key: 'front',       label: 'Front',    deg: '0°' },
  { key: 'front_right', label: 'Fr. Right', deg: '45°' },
  { key: 'right',       label: 'Right',    deg: '90°' },
  { key: 'back_right',  label: 'Bk. Right', deg: '135°' },
  { key: 'back',        label: 'Back',     deg: '180°' },
  { key: 'back_left',   label: 'Bk. Left',  deg: '225°' },
  { key: 'left',        label: 'Left',     deg: '270°' },
  { key: 'front_left',  label: 'Fr. Left',  deg: '315°' },
];

type Step = 'upload' | 'extracting' | 'review-raw' | 'removing-bg' | 'review-final';

export function VideoUploadDialog({ open, onClose }: Props) {
  const extractAngles     = useFurnitureStore((s) => s.extractAngles);
  const removeBackgrounds = useFurnitureStore((s) => s.removeBackgrounds);
  const finalizeUpload    = useFurnitureStore((s) => s.finalizeVideoUpload);
  const uploading         = useFurnitureStore((s) => s.uploading);

  const [step, setStep]               = useState<Step>('upload');
  const [file, setFile]               = useState<File | null>(null);
  const [preview, setPreview]         = useState<string | null>(null);
  const [dragging, setDragging]       = useState(false);
  const [name, setName]               = useState('');
  const [category, setCategory]       = useState<FurnitureCategory>('other');
  const [width, setWidth]             = useState(200);
  const [height, setHeight]           = useState(90);
  const [depth, setDepth]             = useState(85);
  const [stageIdx, setStageIdx]       = useState(0);
  const [error, setError]             = useState<string | null>(null);
  const [itemId, setItemId]           = useState<string | null>(null);
  const [rawImages, setRawImages]     = useState<string[]>([]);
  const [rawLabels, setRawLabels]     = useState<string[]>([]);
  const [finalImages, setFinalImages] = useState<string[]>([]);
  const [finalLabels, setFinalLabels] = useState<string[]>([]);
  const [replacingAngle, setReplacingAngle] = useState<string | null>(null);

  const inputRef       = useRef<HTMLInputElement>(null);
  const replaceRef     = useRef<HTMLInputElement>(null);
  const stageTimer     = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeAngleRef = useRef('');

  useEffect(() => { return () => { if (preview) URL.revokeObjectURL(preview); }; }, [preview]);

  const onFileSelect = useCallback((f: File) => {
    if (!f.type.startsWith('video/')) { setError('Please upload a video file.'); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f); setPreview(URL.createObjectURL(f)); setError(null);
    if (!name) setName(f.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
  }, [preview, name]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) onFileSelect(f);
  }, [onFileSelect]);

  const resetAll = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setStep('upload'); setFile(null); setPreview(null); setDragging(false);
    setName(''); setCategory('other'); setWidth(200); setHeight(90); setDepth(85);
    setStageIdx(0); setError(null); setItemId(null);
    setRawImages([]); setRawLabels([]); setFinalImages([]); setFinalLabels([]);
    setReplacingAngle(null);
    if (stageTimer.current) clearInterval(stageTimer.current);
  }, [preview]);

  const handleClose = () => { if (uploading) return; resetAll(); onClose(); };

  // ─── Step 1 → 2: Extract angles ───
  const handleExtract = async () => {
    if (!file || uploading || !name.trim()) return;
    setStep('extracting'); setError(null); setStageIdx(0);
    let idx = 0;
    stageTimer.current = setInterval(() => {
      idx = Math.min(idx + 1, EXTRACT_STAGES.length - 1);
      setStageIdx(idx);
    }, 2500);
    try {
      const resp = await extractAngles({ name: name.trim(), category, width, height, depth, video: file });
      if (stageTimer.current) clearInterval(stageTimer.current);
      setStageIdx(EXTRACT_STAGES.length - 1);
      setItemId(resp.id);
      setRawImages(resp.angle_images || []);
      setRawLabels(resp.angle_labels || []);
      setTimeout(() => setStep('review-raw'), 600);
    } catch (err) {
      if (stageTimer.current) clearInterval(stageTimer.current);
      setError(err instanceof Error ? err.message : 'Extraction failed.');
      setStep('upload');
    }
  };

  // ─── Replace raw angle image ───
  const handleReplaceClick = (angleKey: string) => {
    activeAngleRef.current = angleKey;
    replaceRef.current?.click();
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f || !itemId) return;
    const angle = activeAngleRef.current;
    setReplacingAngle(angle);
    try {
      const resp = await replaceAngleImage(itemId, angle, f);
      setRawImages(resp.angle_images || rawImages);
      setRawLabels(resp.angle_labels || rawLabels);
    } catch (err) {
      setError(`Replace failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setReplacingAngle(null);
  };

  // ─── Step 3 → 4: Remove backgrounds ───
  const handleRemoveBg = async () => {
    if (!itemId || uploading) return;
    setStep('removing-bg'); setError(null);
    try {
      const resp = await removeBackgrounds(itemId);
      setFinalImages(resp.angle_images || []);
      setFinalLabels(resp.angle_labels || []);
      setTimeout(() => setStep('review-final'), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'BG removal failed.');
      setStep('review-raw');
    }
  };

  // ─── Step 5: Finish ───
  const handleFinish = async () => {
    if (itemId) await finalizeUpload(itemId);
    resetAll(); onClose();
  };

  // Helpers
  const getRawUrl = (key: string): string | null => {
    const idx = rawLabels.indexOf(key);
    return idx >= 0 ? rawImages[idx] : null;
  };
  const getFinalUrl = (key: string): string | null => {
    const idx = finalLabels.indexOf(key);
    return idx >= 0 ? finalImages[idx] : null;
  };

  const isWide = step === 'review-raw' || step === 'review-final';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-5">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose} className="absolute inset-0 bg-black/60" style={{ backdropFilter: 'blur(8px)' }} />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }} transition={{ duration: 0.22 }}
            className="relative w-full bg-[#131318] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            style={{ maxWidth: isWide ? '780px' : '540px', maxHeight: '92vh', overflowY: 'auto', transition: 'max-width 0.3s ease' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center">
                  <Video className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-white/90">
                    {step === 'review-raw' ? 'Review Extracted Frames' :
                     step === 'review-final' ? 'Review Background Removal' :
                     step === 'removing-bg' ? 'Removing Backgrounds...' :
                     '360° Video Upload'}
                  </h2>
                  <p className="text-[11px] text-white/35 mt-0.5">
                    {step === 'review-raw' ? 'Replace any bad angles before bg removal' :
                     step === 'review-final' ? 'Click Finish to add as a 2.5D model' :
                     step === 'removing-bg' ? 'Processing all angle images...' :
                     'Extract 8 directional angles from orbit video'}
                  </p>
                </div>
              </div>
              <button onClick={handleClose} disabled={uploading} className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 disabled:opacity-30 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* ═══ STEP 1: Upload ═══ */}
              {step === 'upload' && (<>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                  className={`relative rounded-xl border-2 border-dashed transition-all cursor-pointer overflow-hidden
                    ${dragging ? 'border-purple-400/60 bg-purple-500/8' : 'border-white/10 bg-white/2 hover:border-white/20'}`}
                  style={{ minHeight: '150px' }}
                >
                  <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelect(f); e.target.value = ''; }} />
                  {preview ? (
                    <div className="relative w-full h-36">
                      <video src={preview} className="w-full h-full object-contain" muted playsInline preload="metadata" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="text-xs font-semibold text-white/80">Click to replace</span>
                      </div>
                      <div className="absolute bottom-0 inset-x-0 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent">
                        <p className="text-[11px] text-white/70 truncate font-medium">{file?.name}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-3">
                        {dragging ? <Play className="w-5 h-5 text-purple-400" /> : <UploadCloud className="w-5 h-5 text-white/25" />}
                      </div>
                      <p className="text-sm font-semibold text-white/60">{dragging ? 'Drop here' : 'Drop or click to upload'}</p>
                      <p className="text-[11px] text-white/30 mt-1.5">MP4 or MOV · 360° orbit · Stable lighting</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold text-white/40 mb-1.5 uppercase tracking-wider">Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office Chair"
                      className="w-full px-3 py-2.5 bg-white/4 border border-white/8 rounded-xl text-sm text-white/85 placeholder-white/20 focus:outline-none focus:border-purple-400/50 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-white/40 mb-1.5 uppercase tracking-wider">Category</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value as FurnitureCategory)}
                      className="w-full px-3 py-2.5 bg-white/4 border border-white/8 rounded-xl text-sm text-white/85 focus:outline-none focus:border-purple-400/50 transition-colors" style={{ colorScheme: 'dark' }}>
                      {FURNITURE_CATEGORIES.filter((c) => c !== 'all').map((c) => (
                        <option key={c} value={c} className="bg-[#1a1a22]">{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-white/40 mb-2 uppercase tracking-wider">Dimensions (cm)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[{ l: 'W', v: width, s: setWidth }, { l: 'D', v: depth, s: setDepth }, { l: 'H', v: height, s: setHeight }].map(({ l, v, s }) => (
                      <div key={l}>
                        <label className="block text-[10px] text-white/30 mb-1">{l}</label>
                        <input type="number" min={1} value={v} onChange={(e) => s(Number(e.target.value))}
                          className="w-full px-2.5 py-2 bg-white/4 border border-white/8 rounded-lg text-sm text-white/85 focus:outline-none focus:border-purple-400/50 transition-colors" style={{ colorScheme: 'dark' }} />
                      </div>
                    ))}
                  </div>
                </div>
              </>)}

              {/* ═══ STEP 2: Extracting ═══ */}
              {step === 'extracting' && (
                <div className="py-6">
                  <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-5">
                    <div className="flex items-center gap-2.5 mb-4">
                      <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                      <span className="text-[13px] font-semibold text-white/80">{EXTRACT_STAGES[stageIdx]}</span>
                    </div>
                    <div className="flex gap-1.5 mb-3">
                      {EXTRACT_STAGES.map((_, i) => (
                        <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${i <= stageIdx ? 'bg-purple-400' : 'bg-white/10'}`} />
                      ))}
                    </div>
                    <p className="text-[10px] text-white/25">Stage {stageIdx + 1} of {EXTRACT_STAGES.length}</p>
                  </div>
                </div>
              )}

              {/* ═══ STEP 3: Review Raw Frames ═══ */}
              {step === 'review-raw' && (<>
                <input ref={replaceRef} type="file" accept="image/*" className="hidden" onChange={handleReplaceFile} />
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-[12px] font-semibold text-emerald-400">{rawLabels.length} angles extracted</span>
                </div>
                <p className="text-[11px] text-white/35">These are the raw frames with original backgrounds. Replace any bad angles, then click <strong className="text-white/50">Continue</strong> to remove backgrounds.</p>

                <div className="grid grid-cols-4 gap-3">
                  {ALL_ANGLES.map(({ key, label, deg }) => {
                    const url = getRawUrl(key);
                    const isReplacing = replacingAngle === key;
                    return (
                      <div key={key} className="flex flex-col rounded-xl border border-white/8 bg-[#0f0f14] overflow-hidden hover:border-purple-500/30 transition-all">
                        <div className="aspect-square relative flex items-center justify-center bg-[#0a0a0e]">
                          {isReplacing ? <Loader2 className="w-5 h-5 text-purple-400 animate-spin" /> :
                           url ? <img src={assetUrl(url)} alt={label} className="w-full h-full object-cover" /> :
                           <div className="flex flex-col items-center gap-1"><ImagePlus className="w-5 h-5 text-white/15" /><span className="text-[9px] text-white/20">Missing</span></div>}
                        </div>
                        <div className="px-2 py-2 border-t border-white/6 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-semibold text-white/70">{label}</p>
                            <p className="text-[8px] text-white/25">{deg}</p>
                          </div>
                          <button onClick={() => handleReplaceClick(key)} disabled={isReplacing}
                            className="p-1 rounded-md text-white/30 hover:text-purple-400 hover:bg-purple-500/15 transition-all disabled:opacity-30" title={`Replace ${label}`}>
                            <RefreshCw className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>)}

              {/* ═══ STEP 4: Removing Backgrounds ═══ */}
              {step === 'removing-bg' && (
                <div className="py-8">
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5 text-center">
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
                    <p className="text-[13px] font-semibold text-white/80 mb-1">Removing backgrounds...</p>
                    <p className="text-[11px] text-white/35">Processing {rawLabels.length} angle images. This may take 30-60 seconds.</p>
                  </div>
                </div>
              )}

              {/* ═══ STEP 5: Review Final (BG Removed) ═══ */}
              {step === 'review-final' && (<>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-[12px] font-semibold text-emerald-400">Backgrounds removed — {finalLabels.length} angles ready</span>
                </div>
                <p className="text-[11px] text-white/35">Review the final images below. Click <strong className="text-white/50">Finish</strong> to add as a 2.5D model to your library.</p>

                <div className="grid grid-cols-4 gap-3">
                  {ALL_ANGLES.map(({ key, label, deg }) => {
                    const url = getFinalUrl(key);
                    return (
                      <div key={key} className="flex flex-col rounded-xl border border-white/8 bg-[#0f0f14] overflow-hidden">
                        <div className="aspect-square relative flex items-center justify-center" style={{ background: 'repeating-conic-gradient(#1a1a1a 0% 25%, #111 0% 50%) 50%/16px 16px' }}>
                          {url ? <img src={assetUrl(url)} alt={label} className="w-full h-full object-contain p-1.5" /> :
                           <span className="text-[9px] text-white/20">N/A</span>}
                        </div>
                        <div className="px-2 py-2 border-t border-white/6">
                          <p className="text-[10px] font-semibold text-white/70">{label}</p>
                          <p className="text-[8px] text-white/25">{deg}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>)}

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex items-start gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/8">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-[12px] text-red-300/90">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/8 flex items-center justify-between">
              <button onClick={handleClose} disabled={uploading} className="px-4 py-2 rounded-lg text-[13px] text-white/50 hover:text-white/70 hover:bg-white/5 disabled:opacity-30 transition-all">
                Cancel
              </button>

              {step === 'upload' && (
                <button onClick={handleExtract} disabled={!file || !name.trim()}
                  className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white gap-2 flex items-center disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>
                  <Video className="w-3.5 h-3.5" /> Extract Angles
                </button>
              )}

              {step === 'extracting' && (
                <button disabled className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white/50 bg-white/5 flex items-center gap-2 cursor-not-allowed">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting…
                </button>
              )}

              {step === 'review-raw' && (
                <button onClick={handleRemoveBg} disabled={!!replacingAngle}
                  className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white gap-2 flex items-center disabled:opacity-30 transition-all"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                  <ArrowRight className="w-3.5 h-3.5" /> Continue — Remove Backgrounds
                </button>
              )}

              {step === 'removing-bg' && (
                <button disabled className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white/50 bg-white/5 flex items-center gap-2 cursor-not-allowed">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Removing…
                </button>
              )}

              {step === 'review-final' && (
                <button onClick={handleFinish}
                  className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white gap-2 flex items-center transition-all"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Finish — Add to Library
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
