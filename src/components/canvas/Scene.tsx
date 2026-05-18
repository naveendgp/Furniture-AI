'use client';

/**
 * Main 3D scene — transparent canvas overlaid on room CSS background.
 * Camera is LOCKED to match room perspective — no orbit/rotation.
 * Furniture items sit on the floor plane and cannot go outside the room.
 */

import { Suspense, useCallback, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useRoomStore } from '@/stores/roomStore';
import { useSceneStore } from '@/stores/sceneStore';
import { assetUrl } from '@/lib/api';
import { FloorPlane } from './FloorPlane';
import { FurnitureItem } from './FurnitureItem';
import { SceneControls } from './SceneControls';

/** Syncs camera to room analysis — runs once on room load */
function CameraSync() {
  const room = useRoomStore((s) => s.room);
  const { camera } = useThree();

  useEffect(() => {
    if (room) {
      camera.position.set(...room.cameraPosition);
      camera.rotation.set(...room.cameraRotation);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = room.perspectiveFov;
        camera.updateProjectionMatrix();
      }
    }
  }, [room, camera]);

  return null;
}

/**
 * Computes worldScale from actual camera geometry.
 * worldScale = visibleWorldWidthAtFloor / roomWidthCm
 * This ensures a 200cm sofa in a 366cm room always renders
 * as exactly 200/366 = 54.6% of the room's visible width.
 */
function CalibrationSync() {
  const room = useRoomStore((s) => s.room);
  const setWorldScale = useSceneStore((s) => s.setWorldScale);
  const { camera, viewport } = useThree();

  useEffect(() => {
    if (!room || room.roomWidthCm <= 0) return;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    // Horizontal FOV derived from vertical FOV + canvas aspect ratio
    const vFovRad = (camera.fov * Math.PI) / 180;
    const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * camera.aspect);

    // Use camera's Z distance to floor center as the reference depth.
    // Furniture sitting on the floor (Y=floorY) at Z=0 is ~cameraZ units away.
    const camZ = camera.position.z;
    const visibleWidthAtRefDepth = 2 * Math.tan(hFovRad / 2) * camZ;

    // worldScale: how many world units = 1 cm, so the room fills visibleWidth exactly
    const worldScale = visibleWidthAtRefDepth / room.roomWidthCm;
    setWorldScale(worldScale);
  }, [room, camera, viewport, setWorldScale]);

  return null;
}

function SceneContent() {
  const room = useRoomStore((s) => s.room);
  const items = useSceneStore((s) => s.items);
  const selectItem = useSceneStore((s) => s.selectItem);
  const setFloorBounds = useSceneStore((s) => s.setFloorBounds);
  const setRoomData = useSceneStore((s) => s.setRoomData);
  const floorY = room?.floorY ?? -1.5;

  // Sync room data to scene store
  useEffect(() => {
    if (room) {
      if (room.floorPolygon?.length >= 3) {
        setFloorBounds(room.floorPolygon);
      }
      setRoomData({
        floorY: room.floorY,
        roomWidthCm: room.roomWidthCm,
        roomDepthCm: room.roomDepthCm,
        suggestedPlacements: room.suggestedPlacements,
      });
    }
  }, [room, setFloorBounds, setRoomData]);

  const handleBackgroundClick = useCallback(() => {
    selectItem(null);
  }, [selectItem]);

  return (
    <>
      <CameraSync />
      <CalibrationSync />

      {/* Advanced Realistic Lighting */}
      <ambientLight intensity={0.5} color="#ffffff" />
      <directionalLight
        position={[4, 8, 4]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0001}
        shadow-camera-far={20}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      {/* Secondary fill light to soften shadows naturally */}
      <directionalLight position={[-3, 4, -3]} intensity={0.3} color="#aaccff" />
      <directionalLight position={[0, 6, 2]} intensity={0.15} color="#fff1e0" />
      <Environment preset="apartment" environmentIntensity={0.6} />

      {/* Floor plane for raycasting */}
      <FloorPlane floorY={floorY} onClickEmpty={handleBackgroundClick} />

      {/* Contact shadows for realistic perceptual grounding */}
      <ContactShadows
        position={[0, floorY + 0.01, 0]}
        opacity={0.9} // Stronger core shadow for physical weight
        scale={25}
        blur={2.0} // Softer edges
        resolution={2048} // High res prevents pixelation on large floors
        far={3}
        color="#050505"
      />

      {/* 3D Furniture objects */}
      {items.map((item) => (
        <FurnitureItem key={item.instanceId} item={item} floorY={floorY} />
      ))}

      {/* NO OrbitControls — camera is locked to room perspective.
          The room image is a CSS background, so any camera movement
          would break the perspective match and furniture would appear
          to float off the walls/floor. */}

      <SceneControls />
    </>
  );
}

interface SceneProps {
  className?: string;
}

export function Scene({ className }: SceneProps) {
  const room = useRoomStore((s) => s.room);
  const fov = room?.perspectiveFov ?? 60;

  // Room image as fixed CSS background
  const bgStyle = room
    ? {
        backgroundImage: `url(${assetUrl(room.imagePath)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#0a0a0b',
      }
    : {};

  return (
    <div
      className={`relative w-full h-full ${className || ''}`}
      id="scene-container"
      style={bgStyle}
    >
      <Canvas
        camera={{
          position: room?.cameraPosition || [0, 1.5, 4],
          fov,
          near: 0.1,
          far: 100,
        }}
        shadows
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15,
          preserveDrawingBuffer: true,
        }}
        style={{ background: 'transparent' }}
        onPointerMissed={() => useSceneStore.getState().selectItem(null)}
      >
        <Suspense fallback={null}>
          <SceneContent />
        </Suspense>
      </Canvas>

      {/* Empty state */}
      {!room && (
        <div style={{padding:"16px",marginTop:"12px"}} className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/70 backdrop-blur-md z-10">
          <div style={{padding:"20px"}} className="flex flex-col items-center justify-center w-[25vw] h-[30vh] p-12 bg-[#1A1A1D]/90 border border-white/5 rounded-[32px] shadow-[0_0_80px_rgba(0,0,0,0.8)] backdrop-blur-3xl">
            <div className="w-[10vh] h-[10vh] rounded-[24px] bg-gradient-to-br from-blue-500/20 to-indigo-600/20 border border-blue-500/30 flex items-center justify-center mb-6 shadow-inner">
              <svg className="w-8 h-8 text-blue-400 mb-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Welcome to FurnitureAI</h2>
            <p className="text-[13px] font-medium mt-3 text-white/50 max-w-sm text-center leading-relaxed">
              Upload a photo of your room using the top menu to start visualizing furniture in your space.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
