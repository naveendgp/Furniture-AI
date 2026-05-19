'use client';

import { useCallback } from 'react';
import { useRoomStore } from '@/stores/roomStore';
import { Image as ImageIcon, Plus, Download, Sofa, Sparkles, Video } from 'lucide-react';
import { captureCompositeScene } from '@/lib/capture';

interface Props {
  onUploadRoom: () => void;
  onUploadFurniture: () => void;
  onUploadVideo: () => void;
  onEnhance: () => void;
}

export function TopBar({ onUploadRoom, onUploadFurniture, onUploadVideo, onEnhance }: Props) {
  const room = useRoomStore((s) => s.room);

  const handleExport = useCallback(async () => {
    try {
      const blob = await captureCompositeScene();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = `room-${Date.now()}.png`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export composite scene', err);
    }
  }, []);

  return (
    <header className="topbar">
      {/* Brand */}
      <div className="flex items-center gap-2.5 mr-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30">
          <Sofa className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-sm text-white/90 tracking-tight">FurnitureAI</span>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-white/8 mx-1" />

      {/* Primary actions */}
      <div className="flex items-center gap-2">
        <button
          id="btn-set-room"
          onClick={onUploadRoom}
          className="btn btn-ghost btn-sm flex items-center gap-1.5 text-white/65 hover:text-white"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          Set Room
        </button>

        <button
          id="btn-add-furniture"
          onClick={onUploadFurniture}
          className="btn btn-primary btn-sm flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Furniture
        </button>

        <button
          id="btn-upload-video"
          onClick={onUploadVideo}
          className="btn btn-sm flex items-center gap-1.5 text-purple-300 hover:text-white border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 hover:border-purple-400/50 transition-all"
          title="Upload 360° orbit video — auto extracts 8 directional angles"
        >
          <Video className="w-3.5 h-3.5" />
          360° Video
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        {room && (
          <div className="flex items-center gap-1.5 px-2.5 h-7 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.8)]" />
            <span className="text-[11px] font-semibold text-emerald-400 tracking-wide">
              Room · AI {Math.round(room.confidence * 100)}%
            </span>
          </div>
        )}

        <button
          onClick={onEnhance}
          className="btn-icon btn-sm rounded-lg text-blue-400 hover:text-white hover:bg-blue-500/20 border border-blue-500/20"
          title="AI V-Ray Render"
        >
          <Sparkles className="w-4 h-4" />
        </button>

        <button
          onClick={handleExport}
          title="Export screenshot"
          className="btn-icon btn-sm rounded-lg"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
