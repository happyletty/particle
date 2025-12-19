import React, { useEffect, useRef } from 'react';
import { initializeHandLandmarker, detectGestures, GestureResult } from '../services/gestureService';

interface CameraHandlerProps {
  onGestureDetected: (gesture: GestureResult) => void;
  onStatusChange: (status: string) => void;
  onError: (error: string) => void;
  onReset?: () => void;
}

const CameraHandler: React.FC<CameraHandlerProps> = ({ onGestureDetected, onStatusChange, onError, onReset }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    // Track if component is mounted to avoid state updates on unmounted component
    let isMounted = true;
    
    const startCamera = async () => {
      console.log("Starting camera initialization...");
      
      // Check for Secure Context (Required for getUserMedia on non-localhost)
      if (!window.isSecureContext) {
        console.log("Not in secure context - camera requires HTTPS or localhost");
        if (isMounted) {
          onError("Camera requires HTTPS or Localhost. Use Mouse/Touch instead.");
        }
        return;
      }

      if (isMounted) {
        onStatusChange("Initializing Vision Model...");
      }
      console.log("Initializing vision model...");
      const success = await initializeHandLandmarker();
      
      if (!success) {
        console.log("Failed to initialize vision model");
        if (isMounted) {
          onError("Failed to load model. Use Mouse/Touch instead.");
        }
        return;
      }

      if (isMounted) {
        onStatusChange("Requesting Camera...");
      }
      console.log("Requesting camera access...");
      try {
        // Try preferred constraints first (User-facing/Front camera)
        console.log("Trying preferred camera constraints...");
        await requestCameraStream({
          video: {
            facingMode: "user",
            width: { ideal: 320 },
            height: { ideal: 240 },
            frameRate: { ideal: 30 }
          }
        });
      } catch (err: any) {
        console.warn("Preferred camera constraints failed, retrying with basic settings...", err);
        // Check if it's a permission error
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          console.log("Camera permission denied by user");
          if (isMounted) {
            onError("摄像头权限被拒绝。请点击上方的重试按钮，然后在弹出的权限请求对话框中选择'允许'。");
            return;
          }
        }
        try {
          // Fallback: Simplest possible request
          console.log("Trying basic camera constraints...");
          await requestCameraStream({ video: true });
        } catch (finalErr: any) {
          console.error("Camera access failed completely:", finalErr);
          // Check if it's a permission error
          if (finalErr.name === 'NotAllowedError' || finalErr.name === 'PermissionDeniedError') {
            if (isMounted) {
              onError("摄像头权限被拒绝。请在浏览器设置中启用摄像头权限，然后点击重试按钮。");
            }
          } else if (finalErr.name === 'NotFoundError' || finalErr.name === 'OverconstrainedError') {
            if (isMounted) {
              onError("未找到可用的摄像头设备。请检查摄像头是否正确连接。");
            }
          } else {
            if (isMounted) {
              onError("摄像头不可用: " + (finalErr.message || "未知错误"));
            }
          }
        }
      }
    };

    const requestCameraStream = async (constraints: MediaStreamConstraints) => {
        console.log("Requesting camera stream with constraints:", constraints);
        
        // Check if permissions API is available
        if ('permissions' in navigator) {
          try {
            const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
            console.log("Camera permission status:", permissionStatus.state);
            
            if (permissionStatus.state === 'denied') {
              console.log("Camera permission explicitly denied");
              throw new Error("摄像头权限已被拒绝。请在浏览器设置中启用摄像头权限。");
            }
            
            if (permissionStatus.state === 'prompt') {
              console.log("Camera permission will prompt");
            }
            
            if (permissionStatus.state === 'granted') {
              console.log("Camera permission already granted");
            }
            
            // Listen for permission changes
            permissionStatus.onchange = () => {
              console.log("Camera permission changed to:", permissionStatus.state);
              if (permissionStatus.state === 'denied') {
                if (isMounted) {
                  onError("摄像头权限已被拒绝。请在浏览器设置中启用摄像头权限。");
                }
              }
            };
          } catch (permissionError) {
            console.log("Could not query camera permissions:", permissionError);
            // Continue anyway as getUserMedia will prompt for permission
          }
        }
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log("Camera stream acquired successfully");
        if (videoRef.current && isMounted) {
          videoRef.current.srcObject = stream;
          // Wait for data to actually load before predicting
          await new Promise<void>((resolve) => {
            if (!videoRef.current) return;
            videoRef.current.onloadeddata = () => {
                console.log("Video loaded data successfully");
                resolve();
            };
          });
          if (isMounted) {
            onStatusChange("Ready");
          }
          console.log("Starting webcam prediction");
          predictWebcam();
        }
    };

    startCamera();

    return () => {
      isMounted = false;
      console.log("Cleaning up camera resources");
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
          console.log("Stopping camera track");
          track.stop();
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const predictWebcam = () => {
    if (videoRef.current && videoRef.current.videoWidth > 0) {
      const gestureResult = detectGestures(videoRef.current);
      // Log gesture detection attempts
      console.log("Gesture detection attempted", gestureResult);
      onGestureDetected(gestureResult);
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