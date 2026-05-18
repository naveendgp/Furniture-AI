'use client';

/**
 * Floor plane — invisible mesh matching the detected floor polygon.
 * Used for raycasting during furniture drag. Furniture can ONLY land here.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { useSceneStore } from '@/stores/sceneStore';

interface FloorPlaneProps {
  floorY: number;
  onClickEmpty: () => void;
}

export function FloorPlane({ floorY, onClickEmpty }: FloorPlaneProps) {
  const floorBounds = useSceneStore((s) => s.floorBounds);

  // Create floor shape geometry from polygon, or a default large plane
  const geometry = useMemo(() => {
    if (floorBounds.length >= 3) {
      const shape = new THREE.Shape();
      shape.moveTo(floorBounds[0][0], floorBounds[0][1]);
      for (let i = 1; i < floorBounds.length; i++) {
        shape.lineTo(floorBounds[i][0], floorBounds[i][1]);
      }
      shape.closePath();
      return new THREE.ShapeGeometry(shape);
    }
    // Default large plane
    return new THREE.PlaneGeometry(20, 20);
  }, [floorBounds]);

  return (
    <mesh
      position={[0, floorY, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      geometry={geometry}
      onClick={(e) => {
        e.stopPropagation();
        onClickEmpty();
      }}
      name="floor-constraint-plane"
    >
      <meshStandardMaterial transparent opacity={0} side={THREE.DoubleSide} />
    </mesh>
  );
}
