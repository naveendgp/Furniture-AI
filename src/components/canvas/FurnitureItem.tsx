'use client';

/**
 * 2.5D Furniture Item — smart billboard rendering.
 *
 * Single-image items: Always face the camera as a clean cutout.
 *   No rotation controls (rotating a flat image doesn't help).
 *
 * Multi-view items: Billboard that swaps textures based on
 *   the furniture's Y rotation, showing the correct angle photo.
 *   Rotation controls let users spin the item to see all sides.
 */

import { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { RotateCcw, RotateCw, ZoomIn, ZoomOut, Trash2 } from 'lucide-react';
import * as THREE from 'three';
import { SceneFurniture } from '@/types';
import { useSceneStore } from '@/stores/sceneStore';
import { assetUrl } from '@/lib/api';

interface FurnitureItemProps {
  item: SceneFurniture;
  floorY: number;
}

// ─── Angle mapping ──────────────────────────────────────────────────

const ANGLE_DEGREES: Record<string, number> = {
  front: 0, front_right: 45, right: 90, back_right: 135,
  back: 180, back_left: 225, left: 270, front_left: 315,
};

function getViewAngle(
  cameraPosition: THREE.Vector3,
  furniturePosition: THREE.Vector3,
  furnitureRotationY: number,
): number {
  const dx = cameraPosition.x - furniturePosition.x;
  const dz = cameraPosition.z - furniturePosition.z;
  let angle = Math.atan2(dx, dz) * (180 / Math.PI);
  angle -= furnitureRotationY * (180 / Math.PI);
  angle = ((angle % 360) + 360) % 360;
  return angle;
}

function findBestAngleIndex(viewAngle: number, angleLabels: string[]): number {
  if (angleLabels.length === 0) return -1;
  let bestIndex = 0;
  let bestDiff = 999;
  for (let i = 0; i < angleLabels.length; i++) {
    const labelAngle = ANGLE_DEGREES[angleLabels[i]] ?? 0;
    let diff = Math.abs(viewAngle - labelAngle);
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) { bestDiff = diff; bestIndex = i; }
  }
  return bestIndex;
}

// ─── Billboard Sprite ───────────────────────────────────────────────

/**
 * Screen-aligned billboard plane.
 * Swaps texture based on furniture rotation.
 * Uses camera.quaternion to prevent corner distortion while maintaining perspective scaling.
 */
function BillboardSprite({
  width,
  height,
  depth,
  imageUrls,
  angleLabels,
  furniturePosition,
  furnitureRotationY,
}: {
  width: number;
  height: number;
  depth: number;
  imageUrls: string[];
  angleLabels: string[];
  furniturePosition: [number, number, number];
  furnitureRotationY: number;
}) {
  const { camera } = useThree();
  const meshRef = useRef<THREE.Mesh>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [textures, setTextures] = useState<(THREE.Texture | null)[]>([]);
  const loadedCountRef = useRef(0);
  const isMultiView = angleLabels.length > 1;

  // DEBUG: log on mount to check if multi-view data is present
  useEffect(() => {
    console.log(`[BillboardSprite] isMultiView=${isMultiView}, labels=${JSON.stringify(angleLabels)}, urls=${imageUrls.length}`);
  }, [isMultiView, angleLabels, imageUrls]);

  useEffect(() => {
    if (imageUrls.length === 0) return;
    const loader = new THREE.TextureLoader();
    const loaded: (THREE.Texture | null)[] = new Array(imageUrls.length).fill(null);
    loadedCountRef.current = 0;

    imageUrls.forEach((url, i) => {
      loader.load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        loaded[i] = tex;
        loadedCountRef.current++;
        setTextures([...loaded]);
      }, undefined, () => { 
        loaded[i] = null; 
        loadedCountRef.current++; 
        setTextures([...loaded]);
      });
    });

    return () => { loaded.forEach((t) => t?.dispose()); };
  }, [imageUrls]);

  useFrame(() => {
    if (meshRef.current && meshRef.current.parent) {
      const parentQuat = meshRef.current.parent.getWorldQuaternion(new THREE.Quaternion());
      meshRef.current.quaternion.copy(parentQuat.invert().multiply(camera.quaternion));
    }

    if (!isMultiView) return;

    const camPos = camera.position;
    const furPos = new THREE.Vector3(...furniturePosition);
    const viewAngle = getViewAngle(camPos, furPos, furnitureRotationY);
    const bestIdx = findBestAngleIndex(viewAngle, angleLabels);

    if (bestIdx !== currentIndex && bestIdx >= 0) {
      console.log(`[2.5D] Angle swap: ${angleLabels[currentIndex]} → ${angleLabels[bestIdx]} (viewAngle=${viewAngle.toFixed(0)}°, rotY=${(furnitureRotationY * 180/Math.PI).toFixed(0)}°, textures=${textures.filter(Boolean).length}/${imageUrls.length})`);
      setCurrentIndex(bestIdx);
    }
  });

  const currentTexture = textures[currentIndex] || textures[0] || null;

  // Use the intrinsic aspect ratio of the photo to prevent ANY distortion.
  // The height is locked to the physical height, and width scales naturally.
  let imageAspect = width / height; // Fallback to physical aspect ratio
  if (currentTexture && currentTexture.image && currentTexture.image.width && currentTexture.image.height) {
    imageAspect = currentTexture.image.width / currentTexture.image.height;
  }
  const currentPlaneWidth = height * imageAspect;

  if (!currentTexture) {
    return (
      <mesh position={[0, height / 2, 0]}>
        <planeGeometry args={[currentPlaneWidth, height]} />
        <meshStandardMaterial color="#333" transparent opacity={0.3} />
      </mesh>
    );
  }

  return (
    <group>
      <mesh ref={meshRef} position={[0, height / 2, 0]} castShadow receiveShadow>
        <planeGeometry args={[currentPlaneWidth, height]} />
        <meshStandardMaterial
          map={currentTexture}
          transparent
          alphaTest={0.05}
          roughness={0.9}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Base shadow anchor */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width * 0.8, width * 0.8]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.15} />
      </mesh>
    </group>
  );
}

// ─── Main FurnitureItem Component ───────────────────────────────────

export function FurnitureItem({ item, floorY }: FurnitureItemProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { camera, raycaster, pointer } = useThree();

  const selectedId = useSceneStore((s) => s.selectedId);
  const selectItem = useSceneStore((s) => s.selectItem);
  const updateItem = useSceneStore((s) => s.updateItem);
  const removeItem = useSceneStore((s) => s.removeItem);
  const worldScale = useSceneStore((s) => s.worldScale);
  const isSelected = selectedId === item.instanceId;

  const hasMultiView = item.asset.angleImages && item.asset.angleImages.length >= 2;

  // DEBUG
  useEffect(() => {
    console.log(`[FurnitureItem] id=${item.assetId} hasMultiView=${hasMultiView} angleImages=${item.asset.angleImages?.length} angleLabels=${item.asset.angleLabels?.length}`, item.asset.angleLabels);
  }, []);

  // Target dimensions in 3D world units.
  // worldScale = (6 world units) / (roomWidthCm) so furniture scales proportionally to the room.
  const dims = useMemo(() => ({
    width:  Math.max(item.asset.width  * worldScale, 0.05),
    height: Math.max(item.asset.height * worldScale, 0.05),
    depth:  Math.max(item.asset.depth  * worldScale, 0.05),
  }), [item.asset.width, item.asset.height, item.asset.depth, worldScale]);

  // Floor plane for drag raycasting
  const floorPlane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY),
    [floorY]
  );

  // Build image URL list
  const imageUrls = useMemo(() => {
    if (hasMultiView) {
      return (item.asset.angleImages || []).map(assetUrl);
    }
    const proc = assetUrl(item.asset.processedImage);
    return proc ? [proc] : [];
  }, [item.asset.angleImages, item.asset.processedImage, hasMultiView]);

  const angleLabels = useMemo(() => {
    if (hasMultiView) return item.asset.angleLabels || [];
    return ['front'];
  }, [item.asset.angleLabels, hasMultiView]);

  const handlePointerDown = useCallback((e: any) => {
    e.stopPropagation();
    selectItem(item.instanceId);
    setIsDragging(true);
    document.body.style.cursor = 'grabbing';
  }, [item.instanceId, selectItem]);

  const handlePointerMove = useCallback((e: any) => {
    if (!isDragging) return;
    e.stopPropagation();

    raycaster.setFromCamera(pointer, camera);
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(floorPlane, intersection);

    if (intersection) {
      updateItem(item.instanceId, {
        position: [intersection.x, floorY, intersection.z],
      });
    }
  }, [isDragging, raycaster, pointer, camera, floorPlane, item.instanceId, floorY, updateItem]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    document.body.style.cursor = 'default';
  }, []);

  const maxDim = Math.max(dims.width, dims.height, dims.depth);

  // ─── Perspective Compensation System ───
  // Subtly enlarges furniture as it moves further away to prevent "miniature" appearance.
  const compensationScale = useRef<number>(1.0);
  
  useFrame(() => {
    if (!groupRef.current) return;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    // 1. Calculate actual distance from camera
    const worldPos = new THREE.Vector3();
    groupRef.current.getWorldPosition(worldPos);
    const dist = camera.position.distanceTo(worldPos);

    // 2. FOV Severity Factor
    // Standard photo FOV is ~45-55. Above 60 is wide angle and causes faster shrinkage.
    const fovSeverity = Math.max(0, (camera.fov - 45) / 45); // e.g. 90 FOV = 1.0 severity

    // 3. Category Weight (Large furniture gets more compensation)
    let categoryWeight = 0.5; // default moderate correction
    const cat = item.asset.category.toLowerCase();
    if (['sofa', 'bed', 'table', 'dining table', 'cabinet'].includes(cat)) {
      categoryWeight = 1.0; // full compensation for visually dominant pieces
    } else if (['chair', 'lamp', 'decor', 'plant'].includes(cat)) {
      categoryWeight = 0.3; // subtle compensation for smaller objects
    }

    // 4. Non-linear distance curve
    // Base distance is roughly the Z distance when dropped near the origin.
    // Furniture closer than baseDist gets NO compensation (1.0).
    const baseDist = Math.abs(camera.position.z) + 1.0; 
    let distanceDelta = Math.max(0, dist - baseDist);
    
    // Easing: sqrt softens the growth so it doesn't inflate endlessly
    let distanceFactor = Math.sqrt(distanceDelta) * 0.04;

    // 5. Final Calculation
    // Base + (Distance Effect * FOV Severity * Category Weight)
    let finalComp = 1.0 + (distanceFactor * (0.5 + fovSeverity * 0.5) * categoryWeight);
    
    // Clamp to maximum +18% to preserve spatial realism
    finalComp = Math.min(finalComp, 1.18);

    // Smoothly interpolate to avoid snapping during fast drags
    compensationScale.current += (finalComp - compensationScale.current) * 0.1;

    // Apply the combined scale: Base User Scale * Compensation
    const s = item.scale[0] * compensationScale.current;
    groupRef.current.scale.set(s, s, s);
  });

  return (
    <group
      ref={groupRef}
      position={item.position}
      rotation={[0, item.rotation[1], 0]}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerEnter={() => { document.body.style.cursor = isDragging ? 'grabbing' : 'grab'; }}
      onPointerLeave={() => { if (!isDragging) document.body.style.cursor = 'default'; }}
      // Scale is now managed entirely by useFrame above
    >
      <BillboardSprite
        width={dims.width}
        height={dims.height}
        depth={dims.depth}
        imageUrls={imageUrls}
        angleLabels={angleLabels}
        furniturePosition={item.position}
        furnitureRotationY={item.rotation[1]}
      />

      {/* Selection highlight — subtle glow ring on floor */}
      {isSelected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[maxDim * 0.35, maxDim * 0.4, 64]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Contextual Mini-Toolbar */}
      {isSelected && !isDragging && (
        <Html position={[0, dims.height + 0.15, 0]} center zIndexRange={[100, 0]} className="pointer-events-auto">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-1 bg-[#1A1A1D]/95 backdrop-blur-2xl border border-white/10 p-1.5 rounded-2xl shadow-2xl">
              {/* Rotation controls */}
              <button 
                onClick={(e) => { e.stopPropagation(); const r = [...item.rotation] as [number,number,number]; r[1] += Math.PI/4; updateItem(item.instanceId, {rotation: r}); }}
                className="p-2 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all hover:scale-105 active:scale-95"
                title="Rotate Left"
              ><RotateCcw className="w-3.5 h-3.5" /></button>
              <button 
                onClick={(e) => { e.stopPropagation(); const r = [...item.rotation] as [number,number,number]; r[1] -= Math.PI/4; updateItem(item.instanceId, {rotation: r}); }}
                className="p-2 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all hover:scale-105 active:scale-95"
                title="Rotate Right"
              ><RotateCw className="w-3.5 h-3.5" /></button>
            <div className="w-px h-4 bg-white/10 mx-0.5" />

            {/* Scale controls */}
            <button 
              onClick={(e) => { e.stopPropagation(); const s = Math.max(0.2, item.scale[0] - 0.1); updateItem(item.instanceId, {scale: [s,s,s]}); }}
              className="p-2 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all hover:scale-105 active:scale-95"
              title="Scale Down"
            ><ZoomOut className="w-3.5 h-3.5" /></button>
            <button 
              onClick={(e) => { e.stopPropagation(); const s = Math.min(3, item.scale[0] + 0.1); updateItem(item.instanceId, {scale: [s,s,s]}); }}
              className="p-2 hover:bg-white/10 rounded-xl text-white/60 hover:text-white transition-all hover:scale-105 active:scale-95"
              title="Scale Up"
            ><ZoomIn className="w-3.5 h-3.5" /></button>


            <div className="w-px h-4 bg-white/10 mx-0.5" />

              <button 
                onClick={(e) => { e.stopPropagation(); removeItem(item.instanceId); }}
                className="p-2 hover:bg-red-500/20 rounded-xl text-red-400 hover:text-red-300 transition-all hover:scale-105 active:scale-95"
                title="Delete"
              ><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </Html>
      )}

      {/* Drag indicator ring */}
      {isDragging && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[maxDim * 0.3, maxDim * 0.35, 64]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}
