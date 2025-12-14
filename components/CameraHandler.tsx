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
        // Try preferred constraints first (User-facing/Front camera)
        await requestCameraStream({
          video: {
            facingMode: "user",
            width: { ideal: 320 },
            height: { ideal: 240 },
            frameRate: { ideal: 30 }
          }
        });
      } catch (err) {
        console.warn("Preferred camera constraints failed, retrying with basic settings...", err);
        try {
          // Fallback: Simplest possible request
          await requestCameraStream({ video: true });
        } catch (finalErr) {
          console.error("Camera access failed completely:", finalErr);
          onError("Camera denied or unavailable. Use Mouse/Touch instead.");
        }
      }
    };

    const requestCameraStream = async (constraints: MediaStreamConstraints) => {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Wait for data to actually load before predicting
          await new Promise<void>((resolve) => {
            if (!videoRef.current) return;
            videoRef.current.onloadeddata = () => {
                resolve();
            };
          });
          onStatusChange("Ready");
          predictWebcam();
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