'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { TopBar } from '@/components/panels/TopBar';
import { LeftPanel } from '@/components/panels/LeftPanel';
import { RightPanel } from '@/components/panels/RightPanel';
import { MultiViewUploadDialog } from '@/components/dialogs/MultiViewUploadDialog';
import { RoomUploadDialog } from '@/components/dialogs/RoomUploadDialog';
import { EnhanceDialog } from '@/components/dialogs/EnhanceDialog';

const Scene = dynamic(
  () => import('@/components/canvas/Scene').then((m) => ({ default: m.Scene })),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center bg-[#08080a]">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
);

export default function HomePage() {
  const [showRoomUpload,      setShowRoomUpload]      = useState(false);
  const [showFurnitureUpload, setShowFurnitureUpload] = useState(false);
  const [showEnhance,         setShowEnhance]         = useState(false);

  return (
    <div className="app-shell">
      {/* Top Navigation Bar */}
      <TopBar
        onUploadRoom={()      => setShowRoomUpload(true)}
        onUploadFurniture={() => setShowFurnitureUpload(true)}
        onEnhance={()         => setShowEnhance(true)}
      />

      {/* Main 3-column workspace */}
      <div className="workspace">
        <LeftPanel />

        {/* 3D canvas */}
        <div id="scene-container" className="scene-area">
          <Scene className="w-full h-full" />
        </div>

        <RightPanel />
      </div>

      {/* Modals */}
      <RoomUploadDialog
        open={showRoomUpload}
        onClose={() => setShowRoomUpload(false)}
      />
      <MultiViewUploadDialog
        open={showFurnitureUpload}
        onClose={() => setShowFurnitureUpload(false)}
      />
      <EnhanceDialog
        open={showEnhance}
        onClose={() => setShowEnhance(false)}
      />
    </div>
  );
}
