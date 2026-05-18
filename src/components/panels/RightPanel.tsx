'use client';

import { useSceneStore } from '@/stores/sceneStore';
import { useRoomStore } from '@/stores/roomStore';
import { useFurnitureStore } from '@/stores/furnitureStore';
import {
  RotateCcw, RotateCw, ZoomIn, ZoomOut, Trash2, Copy,
  Image as ImageIcon, Ruler, Sliders, Zap, ArrowDownToLine, Settings2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function RightPanel() {
  const selectedId   = useSceneStore((s) => s.selectedId);
  const items        = useSceneStore((s) => s.items);
  const updateItem   = useSceneStore((s) => s.updateItem);
  const removeItem   = useSceneStore((s) => s.removeItem);
  const duplicateItem = useSceneStore((s) => s.duplicateItem);
  const addItem      = useSceneStore((s) => s.addItem);
  const getTotalArea = useSceneStore((s) => s.getTotalArea);
  const getOccupiedArea = useSceneStore((s) => s.getOccupiedArea);
  const getFreeSpacePercentage = useSceneStore((s) => s.getFreeSpacePercentage);
  const room         = useRoomStore((s) => s.room);
  const adjustFloor  = useRoomStore((s) => s.adjustFloor);
  const assets       = useFurnitureStore((s) => s.assets);

  const selected = items.find((i) => i.instanceId === selectedId);

  const rotate = (dir: 1 | -1) => {
    if (!selected) return;
    const r = [...selected.rotation] as [number, number, number];
    r[1] += dir * (Math.PI / 12);
    updateItem(selected.instanceId, { rotation: r });
  };

  const scale = (dir: 1 | -1) => {
    if (!selected) return;
    const s = Math.max(0.2, Math.min(3, selected.scale[0] + dir * 0.1));
    updateItem(selected.instanceId, { scale: [s, s, s] });
  };

  return (
    <aside className="side-panel">
      <AnimatePresence mode="wait">

        {/* ── ITEM SELECTED ── */}
        {selected ? (
          <motion.div key="item" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col h-full">
            <div className="panel-header">
              <div className="flex items-center gap-2 mb-0.5">
                <Settings2 className="w-4 h-4 text-white/40" />
                <span className="text-sm font-bold text-white/90 truncate">{selected.asset.name}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] text-white/35 capitalize font-medium">{selected.asset.category}</span>
                {selected.asset.modelUrl && (
                  <span className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[9px] font-bold text-emerald-400 tracking-wider">3D</span>
                )}
              </div>
            </div>

            <div className="panel-body space-y-6">
              
              {/* Original Asset Dimensions */}
              <div>
                <p className="section-label mb-2.5">Original Dimensions</p>
                <div className="grid grid-cols-3 gap-2">
                  {[['Width', selected.asset.width], ['Depth', selected.asset.depth], ['Height', selected.asset.height]].map(([label, val]) => (
                    <div key={String(label)} className="bg-[#1a1a1f] border border-white/7 rounded-xl p-2.5 text-center shadow-sm">
                      <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1">{label}</p>
                      <p className="text-[13px] font-semibold text-white/80">{Math.round(Number(val))} cm</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transform Controls */}
              <div className="space-y-5">
                {/* Rotate */}
                <div>
                  <p className="section-label mb-2.5">Rotate</p>
                  <div className="flex gap-2">
                    <button onClick={() => rotate(1)} className="btn btn-ghost btn-sm flex-1 flex items-center justify-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5" /> Left
                    </button>
                    <button onClick={() => rotate(-1)} className="btn btn-ghost btn-sm flex-1 flex items-center justify-center gap-1.5">
                      Right <RotateCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Precise rotation slider */}
                  <div className="flex items-center gap-3 bg-[#1a1a1f] p-3 rounded-xl border border-white/7 mt-2 shadow-sm">
                    <span className="text-[11px] font-medium text-white/50 w-10">Angle</span>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="1"
                      value={((selected.rotation[1] * (180 / Math.PI)) % 360 + 360) % 360}
                      onChange={(e) => {
                        const deg = parseFloat(e.target.value);
                        const rad = deg * (Math.PI / 180);
                        const r = [...selected.rotation] as [number, number, number];
                        r[1] = rad;
                        updateItem(selected.instanceId, { rotation: r });
                      }}
                      className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400"
                    />
                    <span className="text-[11px] font-mono text-white/70 w-8 text-right">
                      {Math.round(((selected.rotation[1] * (180 / Math.PI)) % 360 + 360) % 360)}°
                    </span>
                  </div>
                </div>

                {/* Scale */}
                <div>
                  <div className="flex justify-between items-end mb-2.5">
                    <p className="section-label mb-0">Scale Override</p>
                    <span className="text-[10px] font-mono font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-md">
                      {selected.scale[0].toFixed(2)}×
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => scale(-1)} className="btn btn-ghost btn-sm flex-1 flex items-center justify-center gap-1.5">
                      <ZoomOut className="w-3.5 h-3.5" /> Smaller
                    </button>
                    <button onClick={() => scale(1)} className="btn btn-ghost btn-sm flex-1 flex items-center justify-center gap-1.5">
                      Larger <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Physical Dimensions & Space Footprint */}
              <div className="bg-[#1a1a1f] border border-white/7 rounded-xl p-4 shadow-inner">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-medium text-white/50">Current Footprint</span>
                  <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">W × D</span>
                </div>
                <div className="flex justify-between items-center text-[14px] font-mono text-white/80 bg-black/25 p-2.5 rounded-lg border border-white/5">
                  <span>{(selected.asset.width * selected.scale[0]).toFixed(0)}cm</span>
                  <span className="text-white/30 text-[10px]">×</span>
                  <span>{(selected.asset.depth * selected.scale[0]).toFixed(0)}cm</span>
                </div>
                <div className="mt-3.5 pt-3.5 border-t border-white/5 flex justify-between items-center">
                  <span className="text-[11px] text-white/40">Space Occupied</span>
                  <span className="text-[12px] font-semibold text-blue-400">
                    {((selected.asset.width * selected.scale[0] / 100) * (selected.asset.depth * selected.scale[0] / 100)).toFixed(2)} m²
                  </span>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-white/7" />

              {/* Actions */}
              <div className="space-y-2">
                <button onClick={() => duplicateItem(selected.instanceId)} className="btn btn-ghost btn-sm w-full flex items-center gap-2">
                  <Copy className="w-3.5 h-3.5" /> Duplicate
                </button>
                <button onClick={() => removeItem(selected.instanceId)} className="btn btn-danger btn-sm w-full flex items-center gap-2">
                  <Trash2 className="w-3.5 h-3.5" /> Remove from Room
                </button>
              </div>
            </div>

            {/* Keyboard shortcuts footer */}
            <div className="panel-footer">
              <p className="section-label mb-2">Keyboard shortcuts</p>
              <div className="grid grid-cols-2 gap-y-1.5 gap-x-3">
                {[['Drag', 'Move'], ['R', 'Rotate'], ['S', 'Scale'], ['Del', 'Delete'], ['Ctrl+D', 'Duplicate'], ['Esc', 'Deselect']].map(([key, action]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-[10px] text-white/30 font-medium">{action}</span>
                    <kbd className="px-1.5 py-0.5 bg-white/6 border border-white/8 rounded text-[9px] font-mono text-white/40">{key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

        ) : (

          /* ── NO SELECTION ── */
          <motion.div key="scene" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col h-full">
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-white/40" />
                <span className="text-sm font-bold text-white/90">Room Settings</span>
              </div>
              <p className="text-[11px] text-white/30 font-medium mt-1">Select furniture to transform it</p>
            </div>

            {room ? (
              <div className="panel-body space-y-6">

                {/* AI Suggestions */}
                {room.suggestedPlacements.length > 0 && assets.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-3">
                      <Zap className="w-3.5 h-3.5 text-blue-400" />
                      <p className="section-label text-blue-400/80">AI Suggestions</p>
                    </div>
                    <div className="space-y-2">
                      {room.suggestedPlacements.map((sp, i) => (
                        <button
                          key={i}
                          onClick={() => addItem(assets[0], [sp.position[0], room.floorY, sp.position[2]])}
                          className="w-full flex items-center justify-between p-3 bg-blue-500/7 hover:bg-blue-500/14 border border-blue-500/18 hover:border-blue-500/35 rounded-xl transition-all duration-150 text-left group"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                              <ArrowDownToLine className="w-3.5 h-3.5 text-blue-400" />
                            </div>
                            <span className="text-[12px] font-semibold text-white/75 capitalize">{sp.label}</span>
                          </div>
                          <span className="text-[10px] font-bold text-blue-400/50 group-hover:text-blue-400 transition-colors uppercase tracking-wider">Place</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Perspective */}
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <p className="section-label">Perspective Adjust</p>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-[11px] font-medium text-white/50">Floor height</span>
                        <span className="text-[11px] font-mono text-white/30">{room.floorY.toFixed(2)}</span>
                      </div>
                      <input type="range" min={-5} max={0} step={0.05} value={room.floorY}
                        onChange={(e) => adjustFloor({ floorY: parseFloat(e.target.value) })} />
                    </div>
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-[11px] font-medium text-white/50">Camera FOV</span>
                        <span className="text-[11px] font-mono text-white/30">{Math.round(room.perspectiveFov)}°</span>
                      </div>
                      <input type="range" min={30} max={90} step={1} value={room.perspectiveFov}
                        onChange={(e) => adjustFloor({ perspectiveFov: parseFloat(e.target.value) })} />
                    </div>
                  </div>
                </div>

                {/* Room dimensions */}
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Ruler className="w-3 h-3 text-white/25" />
                    <p className="section-label">Room Dimensions</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[['Width', room.roomWidthCm], ['Depth', room.roomDepthCm]].map(([label, val]) => (
                      <div key={String(label)} className="bg-[#1a1a1f] border border-white/7 rounded-xl p-3 text-center">
                        <p className="text-[9px] font-bold text-white/25 uppercase tracking-widest mb-1">{label}</p>
                        <p className="text-sm font-semibold text-white/70">{Math.round(Number(val))} cm</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Space Analysis */}
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Zap className="w-3 h-3 text-white/25" />
                    <p className="section-label">Space Analysis</p>
                  </div>
                  <div className="bg-[#1a1a1f] border border-white/7 rounded-xl p-3">
                    <div className="flex justify-between mb-2 text-[11px]">
                      <span className="text-white/50">Free Space</span>
                      <span className="font-mono font-semibold text-white/80">{getFreeSpacePercentage()}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${100 - getFreeSpacePercentage()}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-3 text-[10px] text-white/40">
                      <span>Total: {getTotalArea().toFixed(1)} m²</span>
                      <span>Used: {getOccupiedArea().toFixed(1)} m²</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/4 border border-white/7 flex items-center justify-center mb-3">
                  <ImageIcon className="w-5 h-5 text-white/20" />
                </div>
                <p className="text-sm font-semibold text-white/50 mb-1">No Room Loaded</p>
                <p className="text-[11px] text-white/25 leading-relaxed max-w-[180px]">Upload a room photo to enable perspective tools and smart placement.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
