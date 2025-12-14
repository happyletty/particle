import React, { useEffect, useRef } from 'react';
import { initializeHandLandmarker, detectGestures } from '../services/gestureService';
import { ShapeType } from '../types'; // Kept for type safety if needed, though we emit booleans now

interface CameraHandlerProps {
  onPinchChange: (isPinching: boolean) => void;
  onStatusChange: (status: string) => void;
  onError: (error: string) => void;
}

const CameraHandler: React.FC<CameraHandlerProps> = ({ onPinchChange, onStatusChange, onError }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>(0);
  const lastGestureTime = useRef<number>(0);

  useEffect(() => {
    const startCamera = async () => {
      // Check for Secure Context (Required for getUserMedia on non-localhost)
      if (!window.isSecureContext) {
        onError("Camera requires HTTPS or Localhost. Use Mouse/Touch instead.");
        return;
      }

      onStatusChange("Initializing Vision Model...");
      const success = await initializeHandLandmarker();
      
      if (!success) {
        onError("Failed to load model. Use Mouse/Touch instead.");
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
        onError("Camera denied or unavailable. Use Mouse/Touch instead.");
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
      
      if (isPinching) {
        onPinchChange(true);
        lastGestureTime.current = performance.now();
      } else {
        // Add a tiny delay before snapping back to ensure stability if tracking misses a frame
        if (performance.now() - lastGestureTime.current > 300) {
           onPinchChange(false);
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
      className="camera-feed"
    />
  );
};

export default CameraHandler;