import React, { useEffect, useRef } from 'react';
import { initializeHandLandmarker, detectGestures } from '../services/gestureService';
import { ShapeType } from '../types';

interface CameraHandlerProps {
  onShapeChange: (shape: ShapeType) => void;
  onStatusChange: (status: string) => void;
  onError: (error: string) => void;
}

const CameraHandler: React.FC<CameraHandlerProps> = ({ onShapeChange, onStatusChange, onError }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>();
  const lastGestureTime = useRef<number>(0);

  useEffect(() => {
    const startCamera = async () => {
      // Check for Secure Context (Required for getUserMedia on non-localhost)
      if (!window.isSecureContext) {
        onError("Camera requires HTTPS or Localhost. Use a secure connection.");
        return;
      }

      onStatusChange("Initializing Vision Model...");
      const success = await initializeHandLandmarker();
      
      if (!success) {
        onError("Failed to load hand tracking model.");
        return;
      }

      onStatusChange("Requesting Camera...");
      try {
        // Updated constraints for mobile compatibility
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user", // Prefer front camera on mobile
            width: { ideal: 320 }, // Flexible width
            height: { ideal: 240 }, // Flexible height
            frameRate: { ideal: 30 }
          }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener('loadeddata', () => {
            onStatusChange("Ready");
            predictWebcam();
          });
        }
      } catch (err) {
        console.error(err);
        onError("Camera permission denied. Ensure you are on HTTPS.");
      }
    };

    startCamera();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const predictWebcam = () => {
    if (videoRef.current && videoRef.current.videoWidth > 0) {
      const isPinching = detectGestures(videoRef.current);
      
      // Debounce or immediate? Immediate is more responsive, 
      // but let's ensure we don't flicker.
      // Since the request is "while pinching -> tree", we map direct state.
      
      if (isPinching) {
        onShapeChange(ShapeType.TREE);
        lastGestureTime.current = performance.now();
      } else {
        // Add a tiny delay before snapping back to ensure stability if tracking misses a frame
        if (performance.now() - lastGestureTime.current > 300) {
           onShapeChange(ShapeType.GALAXY);
        }
      }
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className="absolute bottom-4 right-4 w-32 h-24 object-cover opacity-50 rounded-lg pointer-events-none z-50 border border-white/20 transform scale-x-[-1]"
    />
  );
};

export default CameraHandler;