'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Sparkles, Loader2, Download, CheckCircle2 } from 'lucide-react';
import { enhanceScreenshot, assetUrl } from '@/lib/api';
import { captureCompositeScene } from '@/lib/capture';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function EnhanceDialog({ open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ original: string; enhanced: string } | null>(null);
  
  // Ref for the slider
  const [sliderPosition, setSliderPosition] = useState(50);
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Capture canvas and send to API when dialog opens
  useEffect(() => {
    if (open && !result && !loading) {
      processEnhancement();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const processEnhancement = async () => {
    setLoading(true);
    setError(null);
    try {
      // Capture composite screenshot (room background + 3D furniture)
      const blob = await captureCompositeScene();

      if (!blob) throw new Error('Failed to capture scene screenshot');

      // Call API
      const response = await enhanceScreenshot(blob);
      setResult({
        original: assetUrl(response.original_image),
        enhanced: assetUrl(response.enhanced_image),
      });
    } catch (err) {
      console.error('Enhancement failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to enhance image');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setResult(null);
    setError(null);
    onClose();
  };

  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.download = `furniture-ai-enhanced-${Date.now()}.png`;
    a.href = result.enhanced;
    a.click();
  };

  const handlePointerMove = (e: React.PointerEvent | PointerEvent) => {
    if (!isDragging || !sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = (x / rect.width) * 100;
    setSliderPosition(percent);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', () => setIsDragging(false));
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', () => setIsDragging(false));
    };
  }, [isDragging]);

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
            className="absolute inset-0 bg-black/60"
            style={{ backdropFilter: 'blur(8px)' }}
          />

          {/* DIALOG */}
          <motion.div
            role="dialog"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 14 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            className="relative flex w-full max-w-[800px] flex-col overflow-hidden bg-[#1A1A1D] border border-white/5 rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.8)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* HEADER */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-[#121214]">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-400" />
                  AI Render
                </h2>
                <p className="text-[12px] font-medium text-white/50 mt-1">
                  Photorealistic V-Ray style enhancement
                </p>
              </div>
              <button
                onClick={handleClose}
                disabled={loading}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all disabled:opacity-50"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>

            {/* BODY */}
            <div className="relative p-6 flex flex-col items-center justify-center min-h-[400px]">
              {loading ? (
                <div className="flex flex-col items-center text-center max-w-sm">
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-6 relative">
                    <div className="absolute inset-0 border border-blue-400 rounded-2xl animate-ping opacity-20" />
                    <Sparkles className="w-8 h-8 text-blue-400 animate-pulse" />
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-tight mb-2">Rendering...</h3>
                  <p className="text-[13px] text-white/50 leading-relaxed">
                    Applying global illumination, photorealistic textures, and V-Ray lighting effects to your room. This may take up to a minute.
                  </p>
                  <div className="w-full bg-white/5 rounded-full h-1 mt-6 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 w-1/2 animate-[progress_2s_ease-in-out_infinite]" />
                  </div>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                    <X className="w-6 h-6 text-red-400" />
                  </div>
                  <p className="text-sm font-semibold text-white/90">{error}</p>
                  <button onClick={processEnhancement} className="mt-4 btn btn-primary btn-sm">Try Again</button>
                </div>
              ) : result ? (
                <div className="w-full flex flex-col items-center">
                  <div className="w-full text-center mb-4 flex justify-between px-2 text-[11px] font-bold tracking-widest text-white/40 uppercase">
                    <span>Original</span>
                    <span className="text-blue-400">Enhanced</span>
                  </div>
                  
                  {/* Before/After Slider */}
                  <div 
                    ref={sliderRef}
                    className="relative w-full aspect-video rounded-xl overflow-hidden cursor-ew-resize border border-white/10 shadow-2xl"
                    onPointerDown={() => setIsDragging(true)}
                  >
                    {/* Original Image (Background) */}
                    <img 
                      src={result.original} 
                      alt="Original" 
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    
                    {/* Enhanced Image (Foreground/Clipped) */}
                    <div 
                      className="absolute inset-0 w-full h-full object-cover overflow-hidden select-none"
                      style={{ clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)` }}
                    >
                      <img 
                        src={result.enhanced} 
                        alt="Enhanced" 
                        className="absolute inset-0 w-full h-full object-cover max-w-none"
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                    
                    {/* Slider Line & Handle */}
                    <div 
                      className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)] pointer-events-none"
                      style={{ left: `${sliderPosition}%` }}
                    >
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
                        <div className="flex gap-1">
                          <div className="w-0.5 h-3 bg-zinc-300 rounded-full" />
                          <div className="w-0.5 h-3 bg-zinc-300 rounded-full" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* FOOTER */}
            {result && !loading && (
              <div className="px-6 py-5 border-t border-white/5 bg-[#121214] flex justify-end gap-3">
                <button onClick={handleClose} className="btn-ghost px-6 h-10">
                  Close
                </button>
                <button onClick={handleDownload} className="btn-primary px-6 h-10 flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Save HD Render
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
      <style>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </AnimatePresence>
  );
}
