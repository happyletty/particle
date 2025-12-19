import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export interface GestureResult {
  fiveFingerPinch: boolean;
  twoFingerPinch: boolean;
  threeFingerPinch: boolean;
  upwardWave: boolean;
  downwardWave: boolean;
  pinchPosition: { x: number; y: number };
  pinchDelta: { x: number; y: number };
  zoomDirection: 'in' | 'out' | null;
}

let handLandmarker: HandLandmarker | undefined;
let previousGestureResult: GestureResult | null = null;
let gestureHistory: GestureResult[] = [];
let lastGestureTime = 0;
let modeLocked = false;

export const initializeHandLandmarker = async () => {
  try {
    console.log("开始初始化HandLandmarker...");
    
    // 首先尝试使用CDN加载
    try {
      console.log("尝试使用CDN加载模型...");
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
      );
      
      console.log("FilesetResolver创建成功");
      
      // 创建HandLandmarker实例
      handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        },
        runningMode: "VIDEO",
        numHands: 1
      });
      
      console.log("Hand landmarker initialized successfully with CDN");
      return true;
    } catch (cdnError) {
      console.warn("CDN加载失败，尝试使用本地模型文件:", cdnError);
      
      // 如果CDN加载失败，尝试使用本地文件
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "/models"
      );
      
      console.log("本地FilesetResolver创建成功");
      
      // 创建HandLandmarker实例，使用本地模型文件
      handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: `/models/hand_landmarker.task`,
        },
        runningMode: "VIDEO",
        numHands: 1
      });
      
      console.log("Hand landmarker initialized successfully with local files");
      return true;
    }
  } catch (error) {
    console.error("Error initializing hand landmarker:", error);
    return false;
  }
};

const getFingerTip = (landmarks: any[], index: number) => {
  const pip = landmarks[index * 4 + 3];
  const tip = landmarks[index * 4 + 4];
  return { pip, tip };
};

const isFingerExtended = (landmarks: any[], fingerIndex: number): boolean => {
  const pip = landmarks[fingerIndex * 4 + 3];
  const tip = landmarks[fingerIndex * 4 + 4];
  
  // For thumb, check horizontal extension
  if (fingerIndex === 0) {
    return Math.abs(tip.x - pip.x) > 0.04;
  }
  
  // For other fingers, check vertical extension
  return Math.abs(tip.y - pip.y) > 0.04;
};

const calculateFingerPinch = (tip1: any, tip2: any): number => {
  return Math.sqrt(
    Math.pow(tip1.x - tip2.x, 2) + 
    Math.pow(tip1.y - tip2.y, 2) + 
    Math.pow(tip1.z - tip2.z, 2)
  );
};

const detectWaveGesture = (direction: 'up' | 'down'): boolean => {
  if (gestureHistory.length < 5) return false;
  
  const recentGestures = gestureHistory.slice(-5);
  const yPositions = recentGestures.map(g => g.pinchPosition.y);
  
  if (direction === 'up') {
    // Check if Y position is consistently decreasing (moving up)
    const trend = yPositions.every((y, i) => i === 0 || y < yPositions[i - 1] + 0.02);
    return trend && (yPositions[0] - yPositions[yPositions.length - 1]) > 0.1;
  } else {
    // Check if Y position is consistently increasing (moving down)
    const trend = yPositions.every((y, i) => i === 0 || y > yPositions[i - 1] - 0.02);
    return trend && (yPositions[yPositions.length - 1] - yPositions[0]) > 0.1;
  }
};

export const detectGestures = (video: HTMLVideoElement): GestureResult => {
  if (!handLandmarker) {
    console.log("Hand landmarker not initialized");
    return {
      fiveFingerPinch: false,
      twoFingerPinch: false,
      threeFingerPinch: false,
      upwardWave: false,
      downwardWave: false,
      pinchPosition: { x: 0, y: 0 },
      pinchDelta: { x: 0, y: 0 },
      zoomDirection: null
    };
  }

  const result = handLandmarker.detectForVideo(video, performance.now());
  
  // Log when we get results
  if (result.landmarks) {
    console.log("Landmarks detected:", result.landmarks.length);
  }

  if (result.landmarks && result.landmarks.length > 0) {
    const landmarks = result.landmarks[0];
    
    // Get finger tips
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];

    // Calculate centroid
    const centroidX = (thumbTip.x + indexTip.x + middleTip.x + ringTip.x + pinkyTip.x) / 5;
    const centroidY = (thumbTip.y + indexTip.y + middleTip.y + ringTip.y + pinkyTip.y) / 5;

    // Check finger extensions
    const thumbExtended = isFingerExtended(landmarks, 0);
    const indexExtended = isFingerExtended(landmarks, 1);
    const middleExtended = isFingerExtended(landmarks, 2);
    const ringExtended = isFingerExtended(landmarks, 3);
    const pinkyExtended = isFingerExtended(landmarks, 4);

    const extendedFingers = [thumbExtended, indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;

    // Calculate pinch distances
    const thumbIndexDistance = calculateFingerPinch(thumbTip, indexTip);
    const indexMiddleDistance = calculateFingerPinch(indexTip, middleTip);
    const middleRingDistance = calculateFingerPinch(middleTip, ringTip);
    const ringPinkyDistance = calculateFingerPinch(ringTip, pinkyTip);

    // Detect gestures
    const fiveFingerPinch = extendedFingers === 5 && 
      thumbIndexDistance < 0.08 && indexMiddleDistance < 0.08 && 
      middleRingDistance < 0.08 && ringPinkyDistance < 0.08;

    const twoFingerPinch = extendedFingers === 2 && 
      thumbIndexDistance < 0.06;

    const threeFingerPinch = extendedFingers === 3 && 
      thumbIndexDistance < 0.06 && indexMiddleDistance < 0.06;

    // Calculate position delta
    const pinchPosition = { x: centroidX, y: centroidY };
    let pinchDelta = { x: 0, y: 0 };
    
    if (previousGestureResult) {
      pinchDelta = {
        x: pinchPosition.x - previousGestureResult.pinchPosition.x,
        y: pinchPosition.y - previousGestureResult.pinchPosition.y
      };
    }

    // Detect wave gestures
    const upwardWave = detectWaveGesture('up');
    const downwardWave = detectWaveGesture('down');

    // Detect zoom direction (based on three-finger pinch change)
    let zoomDirection: 'in' | 'out' | null = null;
    if (threeFingerPinch && previousGestureResult?.threeFingerPinch) {
      const currentAvgDistance = (thumbIndexDistance + indexMiddleDistance) / 2;
      const prevAvgDistance = (calculateFingerPinch(previousGestureResult.pinchPosition, { x: centroidX, y: centroidY }) || 0.1);
      if (currentAvgDistance < prevAvgDistance - 0.01) {
        zoomDirection = 'out';
      } else if (currentAvgDistance > prevAvgDistance + 0.01) {
        zoomDirection = 'in';
      }
    }

    // Create gesture result
    const gestureResult: GestureResult = {
      fiveFingerPinch,
      twoFingerPinch,
      threeFingerPinch,
      upwardWave,
      downwardWave,
      pinchPosition,
      pinchDelta,
      zoomDirection
    };

    // Update history
    gestureHistory.push(gestureResult);
    if (gestureHistory.length > 10) {
      gestureHistory.shift();
    }

    // Store previous result
    previousGestureResult = gestureResult;
    lastGestureTime = performance.now();

    return gestureResult;
  }

  return {
    fiveFingerPinch: false,
    twoFingerPinch: false,
    threeFingerPinch: false,
    upwardWave: false,
    downwardWave: false,
    pinchPosition: { x: 0, y: 0 },
    pinchDelta: { x: 0, y: 0 },
    zoomDirection: null
  };
};

export const resetGestures = () => {
  gestureHistory = [];
  previousGestureResult = null;
  modeLocked = false;
};

export const isModeLocked = (): boolean => {
  return modeLocked;
};

export const setModeLocked = (locked: boolean) => {
  modeLocked = locked;
};