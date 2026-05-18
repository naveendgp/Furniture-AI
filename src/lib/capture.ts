import { useRoomStore } from '@/stores/roomStore';
import { assetUrl } from './api';

/**
 * Captures the current 3D canvas and composites it over the room's background image.
 * This ensures the exported image contains both the room AND the 3D furniture.
 */
export async function captureCompositeScene(): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const room = useRoomStore.getState().room;
      const webglCanvas = document.querySelector('canvas');
      
      if (!webglCanvas) {
        throw new Error('No 3D scene found');
      }

      // Create a composite canvas matching the WebGL resolution
      const compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = webglCanvas.width;
      compositeCanvas.height = webglCanvas.height;
      const ctx = compositeCanvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Could not create 2D context');
      }

      // Function to draw webgl canvas and resolve
      const drawWebglAndResolve = () => {
        ctx.drawImage(webglCanvas, 0, 0);
        compositeCanvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        }, 'image/png');
      };

      if (!room || !room.imagePath) {
        // No room background, just return the transparent WebGL canvas
        drawWebglAndResolve();
        return;
      }

      // Load background image
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Important for CORS
      img.onload = () => {
        // We need to replicate CSS `background-size: contain`
        // Calculate the aspect ratio of the image and the canvas
        const imgAspect = img.width / img.height;
        const canvasAspect = compositeCanvas.width / compositeCanvas.height;
        
        let drawWidth, drawHeight, drawX, drawY;

        if (imgAspect > canvasAspect) {
          // Image is wider than canvas -> letterbox (black bars top/bottom)
          drawWidth = compositeCanvas.width;
          drawHeight = compositeCanvas.width / imgAspect;
          drawX = 0;
          drawY = (compositeCanvas.height - drawHeight) / 2;
        } else {
          // Image is taller than canvas -> pillarbox (black bars left/right)
          drawWidth = compositeCanvas.height * imgAspect;
          drawHeight = compositeCanvas.height;
          drawX = (compositeCanvas.width - drawWidth) / 2;
          drawY = 0;
        }

        // Fill background with black (matching the app background)
        ctx.fillStyle = '#0a0a0b';
        ctx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);

        // Draw the background image
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        // Draw the WebGL canvas on top
        drawWebglAndResolve();
      };
      
      img.onerror = () => {
        console.error('Failed to load background image for composite, proceeding with just 3D scene');
        drawWebglAndResolve();
      };

      img.src = assetUrl(room.imagePath);

    } catch (err) {
      reject(err);
    }
  });
}
