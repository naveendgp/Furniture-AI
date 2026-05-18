'use client';

import { useState, useRef } from 'react';
import { useFurnitureStore } from '@/stores/furnitureStore';
import { X, Camera, ChevronRight, ChevronLeft, Upload, RotateCcw, Check, AlertTriangle, Box, Sofa } from 'lucide-react';
import { FURNITURE_CATEGORIES, FurnitureCategory } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';

interface Props { open: boolean; onClose: () => void; }

const ANGLE_SLOTS = [
  { key: 'front',      label: 'Front',      required: true,  rotation: '0°'   },
  { key: 'front_right',label: 'Fr. Right',  required: false, rotation: '45°'  },
  { key: 'right',      label: 'Right',      required: false, rotation: '90°'  },
  { key: 'back_right', label: 'Bk. Right',  required: false, rotation: '135°' },
  { key: 'back',       label: 'Back',       required: false, rotation: '180°' },
  { key: 'back_left',  label: 'Bk. Left',   required: false, rotation: '225°' },
  { key: 'left',       label: 'Left',       required: false, rotation: '270°' },
  { key: 'front_left', label: 'Fr. Left',   required: false, rotation: '315°' },
];

interface AngleImage { file: File; preview: string; angle: string; }

export function MultiViewUploadDialog({ open, onClose }: Props) {
  const uploadMultiView = useFurnitureStore((s) => s.uploadMultiView);
  const uploading       = useFurnitureStore((s) => s.uploading);

  const [step, setStep]               = useState(1);
  const [angleImages, setAngleImages] = useState<Map<string, AngleImage>>(new Map());
  const [name, setName]               = useState('');
  const [category, setCategory]       = useState<FurnitureCategory>('other');
  const [width, setWidth]             = useState(100);
  const [height, setHeight]           = useState(100);
  const [depth, setDepth]             = useState(50);
  const [processing, setProcessing]   = useState(false);
  const [done, setDone]               = useState(false);

  const fileInputRef    = useRef<HTMLInputElement>(null);
  const activeAngleRef  = useRef<string>('');

  const totalImages   = angleImages.size;
  const canProceed    = totalImages >= 2;
  const canSubmit     = !!name && canProceed;

  const handleAngleClick = (key: string) => {
    activeAngleRef.current = key;
    fileInputRef.current?.click();
  };

  const handleAngleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const angle = activeAngleRef.current;
    setAngleImages((prev) => {
      const next = new Map(prev);
      next.set(angle, { file, preview: URL.createObjectURL(file), angle });
      return next;
    });
    if (!name) setName(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setProcessing(true);
    try {
      const images: File[] = [], angles: string[] = [];
      angleImages.forEach((ai) => { images.push(ai.file); angles.push(ai.angle); });
      await uploadMultiView({ name, category, width, height, depth, images, angles });
      setDone(true);
      setTimeout(() => handleClose(), 1800);
    } catch (err) {
      console.error(err);
      setProcessing(false);
    }
  };

  const handleClose = () => {
    setStep(1); setAngleImages(new Map()); setName('');
    setCategory('other'); setWidth(100); setHeight(100); setDepth(50);
    setProcessing(false); setDone(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div 
        style={{padding:"40px"}}
        className="fixed inset-0 z-[300] flex items-center justify-center p-6 sm:p-8">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={!processing ? handleClose : undefined}
          />

          {/* Modal - Widened slightly to max-w-[540px] for better grid proportions */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', damping: 30, stiffness: 350 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[540px] max-h-[90vh] bg-[#131316] border border-white/8 rounded-3xl shadow-[0_40px_100px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden"
          >
            {/* Header - Increased padding (px-8 pt-7 pb-5) */}
            <div style={{padding:"10px"}}
            className="flex items-center justify-between px-8 pt-7 pb-5 border-b border-white/6 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0">
                  <Sofa className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-[17px] font-bold text-white leading-tight tracking-wide">Add Furniture</h2>
                  <p className="text-[13px] text-white/40 font-medium mt-1">
                    {step === 1 ? 'Upload angle photos' : 'Name & dimensions'}
                  </p>
                </div>
              </div>
              <button onClick={handleClose} disabled={processing}
                className="w-8 h-8 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/6 rounded-xl transition-all disabled:opacity-30">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step progress - Increased padding */}
            <div className="flex gap-2 px-8 py-4 shrink-0">
              {[1, 2].map((s) => (
                <div key={s} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${s <= step ? 'bg-blue-500' : 'bg-white/8'}`} />
              ))}
            </div>

            {/* Content Container */}
            <div style={{"padding":"8px"}} className="flex-1 overflow-y-auto min-h-0">
              <AnimatePresence mode="wait">

                {/* ── STEP 1: Angle grid ── */}
                {step === 1 && !processing && (
                  <motion.div key="s1" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} 
                    className="px-8 pb-8 pt-2 space-y-6" /* Increased padding & spacing */
                  >
                    {/* Info row - More padding internally */}
                    <div style={{"padding":"6px"}} className="flex items-center justify-between px-4 py-3.5 bg-white/3 border border-white/6 rounded-2xl">
                      <p className="text-[12px] font-medium text-white/45">
                        Upload angles — <span className="text-blue-400 font-semibold">minimum 2 required</span>
                      </p>
                      <span style={{"padding":"4px"}} className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${totalImages >= 2 ? 'bg-emerald-500/12 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-white/30 border border-white/8'}`}>
                        {totalImages} / 8
                      </span>
                    </div>

                    {/* 4×2 angle grid - Increased gap (gap-3 to gap-4) */}
                    <div style={{"padding":"8px"}} className="grid grid-cols-4 gap-3.5">
                      {ANGLE_SLOTS.map((slot) => {
                        const img = angleImages.get(slot.key);
                        return (
                          <div key={slot.key}>
                            <button
                              onClick={() => handleAngleClick(slot.key)}
                              className={`group w-full aspect-square rounded-2xl border-2 border-dashed relative overflow-hidden flex items-center justify-center transition-all duration-150
                                ${img
                                  ? 'border-emerald-500/30 bg-[#0e1f14]'
                                  : slot.required
                                    ? 'border-blue-500/30 hover:border-blue-500/55 bg-blue-500/5 hover:bg-blue-500/10'
                                    : 'border-white/8 hover:border-white/18 bg-[#0f0f12] hover:bg-white/3'
                                }`}
                            >
                              {img ? (
                                <>
                                  <img src={img.preview} alt={slot.label} className="absolute inset-0 w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <RotateCcw className="w-5 h-5 text-white" />
                                  </div>
                                  <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-emerald-500 rounded-lg flex items-center justify-center shadow">
                                    <Check className="w-3.5 h-3.5 text-white" />
                                  </div>
                                </>
                              ) : (
                                <>
                                  <Camera className={`w-5 h-5 transition-colors ${slot.required ? 'text-blue-400/50 group-hover:text-blue-400' : 'text-white/15 group-hover:text-white/35'}`} />
                                  {slot.required && <span className="absolute top-1.5 right-1.5 text-blue-400 text-[10px] font-bold">★</span>}
                                </>
                              )}
                            </button>
                            <p className="text-center text-[10px] font-semibold text-white/40 mt-2 truncate tracking-wide">{slot.label}</p>
                            <p className="text-center text-[9px] font-mono text-white/20 mt-0.5">{slot.rotation}</p>
                          </div>
                        );
                      })}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAngleFile} className="hidden" />

                    {/* Warning - More padding inside the box */}
                   
                  </motion.div>
                )}

                {/* ── STEP 2: Details ── */}
                {step === 2 && !processing && (
                  <motion.div key="s2" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} 
                    className="px-8 pb-8 pt-2 space-y-7" /* Spread out the form fields */
                  >
                    {/* Name */}
                    <div className="space-y-2.5">
                      <label className="text-[11px] font-bold text-white/40 uppercase tracking-widest block">Furniture Name</label>
                      <input
                        type="text" value={name} onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Modern Sofa, Oak Chair…"
                        className="field w-full py-3 px-4 text-[14px] bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:border-blue-500/50 outline-none transition-colors"
                      />
                    </div>

                    {/* Category */}
                    <div className="space-y-3" style={{padding:"4px"}}>
                      <label className="text-[11px] font-bold text-white/40 uppercase tracking-widest block">Category</label>
                      <div className="flex flex-wrap gap-2">
                        {FURNITURE_CATEGORIES.filter((c) => c !== 'all').map((cat) => (
                          <button key={cat} onClick={() => setCategory(cat)}
                          style={{padding:"4px", borderRadius:"8px"}}
                            className={`px-4 py-2.5 text-[12px] rounded-xl capitalize font-semibold transition-all ${category === cat ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'bg-white/5 border border-white/8 text-white/40 hover:bg-white/10 hover:text-white/70'}`}>
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dimensions */}
                    <div className="space-y-3" style={{padding:"4px"}}>
                      <div className="grid grid-cols-3 gap-4">
                        {[
                          { label: 'Width', hint: 'left ↔ right', value: width, set: setWidth }, 
                          { label: 'Depth', hint: 'front ↔ back', value: depth, set: setDepth },
                          { label: 'Height', hint: 'floor ↔ top', value: height, set: setHeight }
                        ].map(({ label, hint, value, set }) => (
                          <div key={label}>
                            <p className="text-[11px] text-white/35 font-semibold mb-0.5 uppercase tracking-wider">{label}</p>
                            <p className="text-[9px] text-white/25 font-medium mb-2">{hint}</p>
                            <input type="number" min={10} max={500} value={value}
                              onChange={(e) => set(Number(e.target.value) || 50)}
                              className="field w-full py-2.5 px-3 text-[14px] bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-blue-500/50 transition-colors" />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Angle summary */}
                    <div style={{padding:"4px"}} className="flex items-center gap-2.5 p-4 bg-emerald-500/6 border border-emerald-500/15 rounded-2xl">
                      <Check className="w-fit h-4 text-emerald-400 shrink-0" />
                      <p className="text-[12px] text-emerald-300/80 font-medium">{totalImages} angle photo{totalImages !== 1 ? 's' : ''} ready to upload</p>
                    </div>
                  </motion.div>
                )}

                {/* ── Processing / Done ── */}
                {processing && (
                  <motion.div key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 px-8 flex flex-col items-center text-center">
                    {done ? (
                      <>
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }}
                          className="w-20 h-20 rounded-[20px] bg-emerald-500/15 border-2 border-emerald-500/30 flex items-center justify-center mb-5 shadow-[0_0_40px_rgba(16,185,129,0.15)]">
                          <Check className="w-8 h-8 text-emerald-400" />
                        </motion.div>
                        <h3 className="text-[18px] font-bold text-white">Furniture Added!</h3>
                        <p className="text-[13px] text-white/40 mt-2.5 leading-relaxed">Your furniture is now in the library and ready to place.</p>
                      </>
                    ) : (
                      <>
                        <div className="relative w-20 h-20 flex items-center justify-center mb-5">
                          <div className="absolute inset-0 rounded-[20px] border-4 border-blue-500/15" />
                          <div className="absolute inset-0 rounded-[20px] border-4 border-blue-500 border-t-transparent animate-spin" />
                          <Box className="w-7 h-7 text-blue-400 animate-pulse" />
                        </div>
                        <h3 className="text-[18px] font-bold text-white">Processing…</h3>
                        <p className="text-[13px] text-white/35 mt-2.5">Removing background & generating assets</p>
                      </>
                    )}
                  </motion.div>
                )}

              </AnimatePresence>
            </div>

           {/* Footer */}
           {/* Footer */}
            {!processing && (
              <div
              style={{padding:"6px"}}
               className="flex items-center justify-between px-10 py-6 border-t border-white/5 shrink-0 bg-[#131316]">
                <div>
                  {step > 1 && (
                    <button 
                      onClick={() => setStep(step - 1)}
                      className="inline-flex items-center justify-center gap-2 px-5 py-3 text-[14px] font-medium text-white/50 transition-all rounded-xl hover:text-white hover:bg-white/10 whitespace-nowrap"
                    >
                      <ChevronLeft className="w-4 h-4 shrink-0" /> Back
                    </button>
                  )}
                </div>
                
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleClose} 
                    className="inline-flex items-center justify-center px-5 py-3 text-[14px] font-medium text-white/50 transition-all rounded-xl hover:text-white hover:bg-white/10 whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  
                  {step === 1 && (
                    <button 
                      onClick={() => setStep(2)} 
                      disabled={!canProceed}
                      style={{"padding":"8px"}}
                      className="inline-flex items-center justify-center gap-2 px-7 py-3 text-[14px] font-semibold text-white transition-all bg-blue-600 rounded-xl hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 whitespace-nowrap shadow-sm"
                    >
                      Next <ChevronRight className="w-4 h-4 shrink-0" />
                    </button>
                  )}
                  
                  {step === 2 && (
                    <button 
                    style={{padding:"4px"}}
                      onClick={handleSubmit} 
                      disabled={!canSubmit || uploading}
                      className="inline-flex items-center justify-center gap-2 px-7 py-3 text-[14px] font-semibold text-white transition-all bg-blue-600 rounded-xl hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 whitespace-nowrap shadow-sm"
                    >
                      <Upload style={{padding:"4px"}} className="w-4 h-4 shrink-0" /> Add to Library
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}