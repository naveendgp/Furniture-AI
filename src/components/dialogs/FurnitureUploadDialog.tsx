'use client';

import { useState, useRef } from 'react';
import { useFurnitureStore } from '@/stores/furnitureStore';
import { FURNITURE_CATEGORIES } from '@/types';
import { X, UploadCloud, Box, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props { open: boolean; onClose: () => void }

export function FurnitureUploadDialog({ open, onClose }: Props) {
  const uploadFurniture = useFurnitureStore((s) => s.uploadFurniture);
  const uploading = useFurnitureStore((s) => s.uploading);
  const generationAvailable = useFurnitureStore((s) => s.generationAvailable);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('other');
  const [width, setWidth] = useState(100);
  const [height, setHeight] = useState(100);
  const [depth, setDepth] = useState(50);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (f: File | null) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    if (!name) setName(f.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
  };

  const handleSubmit = async () => {
    if (!file || !name) return;
    try {
      await uploadFurniture({ name, category, width, height, depth, image: file });
      setName(''); setFile(null); setPreview(null);
      setWidth(100); setHeight(100); setDepth(50);
      onClose();
    } catch (e) { console.error(e); }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-md" 
            onClick={!uploading ? onClose : undefined} 
          />
          
          {/* Modal */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-2xl bg-[#1A1A1D] border border-white/5 rounded-3xl shadow-2xl overflow-hidden flex flex-col" 
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Header */}
            <div className="relative px-6 py-5 flex items-center justify-between border-b border-white/5 shrink-0 bg-[#121214]">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Add Furniture</h2>
                <p className="text-[11px] font-semibold text-white/50 mt-1.5 flex items-center gap-1.5 uppercase tracking-wider">
                  {generationAvailable ? (
                    <><Sparkles className="w-3.5 h-3.5 text-blue-400" /> AI will generate a 3D model</>
                  ) : (
                    'Upload furniture photo'
                  )}
                </p>
              </div>
              <button onClick={onClose} disabled={uploading} className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-xl transition-all shrink-0 disabled:opacity-50">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="relative p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
              
              {/* Image Upload Area */}
              <div 
                onClick={() => !uploading && fileRef.current?.click()}
                className={`group relative w-full aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden p-2 ${
                  preview 
                    ? 'border-white/5 bg-black/40' 
                    : 'border-white/10 hover:border-blue-500/50 hover:bg-blue-500/5 bg-black/20'
                } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
              >
                {preview ? (
                  <motion.img 
                    initial={{ opacity: 0, scale: 1.05 }}
                    animate={{ opacity: 1, scale: 1 }}
                    src={preview} 
                    alt="Preview" 
                    className="w-full h-full object-contain rounded-xl drop-shadow-2xl" 
                  />
                ) : (
                  <div className="flex flex-col items-center text-center p-6">
                    <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform shadow-inner border border-white/5">
                      <UploadCloud className="w-6 h-6 text-white/40 group-hover:text-blue-400 transition-colors" />
                    </div>
                    <p className="text-sm font-bold text-white/90 tracking-tight">Click to browse photos</p>
                    <p className="text-[11px] font-medium text-white/40 mt-2.5 max-w-[260px] leading-relaxed">Clean photos on simple backgrounds work best for AI 3D conversion</p>
                  </div>
                )}
                {/* Hover overlay for replace */}
                {preview && !uploading && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl m-2 backdrop-blur-sm">
                    <p className="text-xs font-bold text-white tracking-wide bg-white/10 px-4 py-2 rounded-lg border border-white/10 shadow-lg">Click to replace photo</p>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={(e) => handleFileChange(e.target.files?.[0] || null)} className="hidden" />

              {/* Details Form */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1.5">Item Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Modern Leather Sofa"
                      className="w-full px-4 py-3 bg-black/20 border border-white/5 rounded-xl text-sm font-medium text-white placeholder-white/20 focus:border-blue-500 focus:outline-none transition-colors" />
                  </div>
                  
                  <div>
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1.5">Category</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-4 py-3 bg-black/20 border border-white/5 rounded-xl text-sm font-medium text-white focus:border-blue-500 focus:outline-none transition-colors capitalize">
                      {FURNITURE_CATEGORIES.filter(c => c !== 'all').map((c) => (
                        <option key={c} value={c} className="bg-zinc-900">{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block mb-1.5">Approx Size</label>
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
                  </div>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="relative px-6 py-5 bg-[#121214] border-t border-white/5 flex gap-3 justify-end items-center shrink-0">
              <button onClick={onClose} disabled={uploading} className="btn-ghost px-6 shrink-0">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={!file || !name || uploading} className="btn-primary px-8 shrink-0 relative overflow-hidden group">
                {uploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{generationAvailable ? 'Generating 3D...' : 'Processing...'}</span>
                  </>
                ) : (
                  <>
                    <Box className="w-4 h-4" />
                    <span>Add Item</span>
                  </>
                )}
                {/* Shimmer effect */}
                {!uploading && file && name && (
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                )}
              </button>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
