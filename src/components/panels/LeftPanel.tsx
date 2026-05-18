'use client';

import { useEffect, useState } from 'react';
import { useFurnitureStore } from '@/stores/furnitureStore';
import { useSceneStore } from '@/stores/sceneStore';
import { FurnitureCategory, FURNITURE_CATEGORIES } from '@/types';
import { assetUrl, reprocessAllFurniture } from '@/lib/api';
import { Package, RefreshCw, LayoutGrid, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function LeftPanel() {
  const assets        = useFurnitureStore((s) => s.assets);
  const loading       = useFurnitureStore((s) => s.loading);
  const fetchAll      = useFurnitureStore((s) => s.fetchAll);
  const deleteAsset   = useFurnitureStore((s) => s.deleteAsset);
  const smartAddItem  = useSceneStore((s) => s.smartAddItem);

  const [tab, setTab]           = useState<FurnitureCategory>('all');
  const [reprocessing, setRep]  = useState(false);
  const [deletingId, setDelId]  = useState<string | null>(null);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = tab === 'all' ? assets : assets.filter((a) => a.category === tab);

  const handleReprocess = async () => {
    setRep(true);
    try { await reprocessAllFurniture(); await fetchAll(); } catch {}
    setRep(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Don't add to scene
    if (deletingId) return; // Already deleting
    setDelId(id);
    try {
      await deleteAsset(id);
    } catch {}
    setDelId(null);
  };

  return (
    <aside className="side-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-white/40" />
            <span className="text-sm font-bold text-white/90">Library</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-white/30 font-medium">{assets.length} items</span>
            <button
              onClick={handleReprocess}
              disabled={reprocessing}
              title="Re-process all"
              className="btn-icon btn-sm disabled:opacity-30"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${reprocessing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <div className="px-4 py-3 border-b border-white/7 shrink-0">
        <div className="seg-control overflow-x-auto">
          {FURNITURE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setTab(cat)}
              className={`seg-btn capitalize ${tab === cat ? 'active' : ''}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="panel-body">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center justify-center h-32"
            >
              <div className="w-5 h-5 border-2 border-white/15 border-t-white/60 rounded-full animate-spin" />
            </motion.div>
          ) : filtered.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-40 text-center px-4"
            >
              <div className="w-10 h-10 rounded-xl bg-white/4 border border-white/8 flex items-center justify-center mb-3">
                <Package className="w-4 h-4 text-white/25" />
              </div>
              <p className="text-xs font-semibold text-white/50 mb-1">No items found</p>
              <p className="text-[11px] text-white/25 leading-relaxed">Upload furniture to build your library</p>
            </motion.div>
          ) : (
            <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="grid grid-cols-2 gap-2"
            >
              {filtered.map((asset) => (
                <motion.div
                  key={asset.id}
                  whileHover={{ y: -1, scale: 1.01 }}
                  className="group relative flex flex-col rounded-xl overflow-hidden border border-white/7 bg-[#1a1a1f] hover:border-blue-500/35 hover:shadow-[0_4px_16px_rgba(59,130,246,0.12)] transition-all duration-150"
                >
                  {/* Click area — adds to scene */}
                  <button
                    onClick={() => smartAddItem(asset)}
                    className="flex flex-col text-left w-full"
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square relative flex items-center justify-center bg-[#0f0f12] p-2">
                      {asset.processedImage ? (
                        <img
                          src={assetUrl(asset.processedImage)}
                          alt={asset.name}
                          className="w-full h-full object-contain drop-shadow-lg group-hover:scale-105 transition-transform duration-200"
                          loading="lazy"
                        />
                      ) : (
                        <Package className="w-5 h-5 text-white/15" />
                      )}

                      {/* Status badge */}
                      {asset.generationStatus === 'processing' && (
                        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded text-[8px] font-bold text-blue-400 flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
                          GEN
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="px-2.5 py-2 border-t border-white/5">
                      <p className="text-[11px] font-semibold text-white/80 truncate leading-tight">{asset.name}</p>
                      <p className="text-[9px] text-white/30 capitalize mt-0.5 font-medium tracking-wide">{asset.category}</p>
                    </div>
                  </button>

                  {/* Delete button — appears on hover */}
                  {!asset.builtin && (
                    <button
                      onClick={(e) => handleDelete(e, asset.id)}
                      disabled={deletingId === asset.id}
                      className="absolute top-1.5 left-1.5 p-1.5 rounded-lg bg-black/70 border border-white/10 text-white/40 hover:text-red-400 hover:bg-red-500/20 hover:border-red-500/30 opacity-0 group-hover:opacity-100 transition-all duration-150 backdrop-blur-sm disabled:opacity-50"
                      title="Delete from library"
                    >
                      {deletingId === asset.id ? (
                        <div className="w-3 h-3 border border-white/30 border-t-white/70 rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </button>
                  )}
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer hint */}
      <div className="panel-footer">
        <p className="text-[10px] text-white/25 text-center font-medium">Click any item to place it in the room</p>
      </div>
    </aside>
  );
}
