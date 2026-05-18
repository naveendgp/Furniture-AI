'use client';

/**
 * Scene controls — keyboard shortcuts.
 * OrbitControls are in Scene.tsx (limited angle range).
 */

import { useEffect } from 'react';
import { useSceneStore } from '@/stores/sceneStore';

export function SceneControls() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const store = useSceneStore.getState();
      switch (e.key.toLowerCase()) {
        case 'g':
          store.setTransformMode('translate');
          break;
        case 'r':
          store.setTransformMode('rotate');
          break;
        case 's':
          if (!e.ctrlKey) store.setTransformMode('scale');
          break;
        case 'delete':
        case 'backspace':
          if (store.selectedId) store.removeItem(store.selectedId);
          break;
        case 'escape':
          store.selectItem(null);
          break;
        case 'd':
          if (e.ctrlKey && store.selectedId) {
            e.preventDefault();
            store.duplicateItem(store.selectedId);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return null;
}
