import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

let handLandmarker: HandLandmarker | undefined;

export const initializeHandLandmarker = async () => {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 1
    });
    return true;
  } catch (error) {
    console.error("Error initializing hand landmarker:", error);
    return false;
  }
};

export const detectGestures = (video: HTMLVideoElement): boolean => {
  if (!handLandmarker) return false;

  const result = handLandmarker.detectForVideo(video, performance.now());

  if (result.landmarks && result.landmarks.length > 0) {
    const landmarks = result.landmarks[0];
    
    // Landmark indices:
    // 4: Thumb tip
    // 8: Index tip
    // 12: Middle tip
    // 16: Ring tip
    // 20: Pinky tip
    
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];

    // Calculate centroid of the 5 tips
    const centroidX = (thumbTip.x + indexTip.x + middleTip.x + ringTip.x + pinkyTip.x) / 5;
    const centroidY = (thumbTip.y + indexTip.y + middleTip.y + ringTip.y + pinkyTip.y) / 5;
    const centroidZ = (thumbTip.z + indexTip.z + middleTip.z + ringTip.z + pinkyTip.z) / 5;

    // Calculate average distance from centroid
    const dist = (p: any) => Math.sqrt(
      Math.pow(p.x - centroidX, 2) + 
      Math.pow(p.y - centroidY, 2) + 
      Math.pow(p.z - centroidZ, 2)
    );

    const avgDistance = (
      dist(thumbTip) + dist(indexTip) + dist(middleTip) + dist(ringTip) + dist(pinkyTip)
    ) / 5;

    // Threshold for "bunched together" (Pinch all 5 fingers)
    // Values are normalized [0,1]. 0.04 is a tight cluster.
    const PINCH_THRESHOLD = 0.06; 

    return avgDistance < PINCH_THRESHOLD;
  }

  return false;
};