"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, Clone, Environment } from "@react-three/drei";
import * as THREE from "three";

/* Front picker — shows the model in the SAME orientation frame as the studio
   camera (camera on +Z looking toward the model). The vendor rotates it with the
   yaw slider until the FRONT faces the viewer; that yaw is stored as the product's
   frontYaw so the studio can auto-face it. */

function Model({ url, yaw }: { url: string; yaw: number }) {
  const { scene } = useGLTF(url);
  const { offset, fit } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fit = 1.5 / maxDim;
    const offset: [number, number, number] = [-center.x, -center.y, -center.z];
    return { offset, fit };
  }, [scene]);

  return (
    <group rotation-y={(yaw * Math.PI) / 180} scale={fit}>
      <group position={offset}>
        <Clone object={scene} />
      </group>
    </group>
  );
}

export function FrontPicker({ url, yaw }: { url: string; yaw: number }) {
  return (
    <Canvas
      camera={{ position: [0, 0.2, 2.6], fov: 40 }}
      gl={{ antialias: true }}
      style={{ background: "transparent" }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 4, 3]} intensity={1.1} />
        <Model url={url} yaw={yaw} />
        <Environment preset="apartment" />
      </Suspense>
    </Canvas>
  );
}
