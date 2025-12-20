import React, { useState, Suspense, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Environment } from '@react-three/drei';
import { ParticleScene, FloatingParticles, ShootingStars } from './components/ParticleScene';
import CameraHandler from './components/CameraHandler';
import { ShapeType } from './types';
import { GestureResult } from './services/gestureService';

// --- Background Music Component ---
const BackgroundMusic = ({ currentShape, hasUserInteracted }: { currentShape: ShapeType; hasUserInteracted: boolean }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // 初始化音频
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // 设置新音频源
    const newSrc = currentShape === ShapeType.GALAXY 
      ? "/assets/lo-fi-universe-2-lofi-254365.mp3" 
      : "/assets/jingle-bells-182492.mp3";
    
    console.log(`切换到${currentShape === ShapeType.GALAXY ? '银河' : '圣诞树'}模式，使用音频: ${newSrc}`);
    
    // 检查是否需要更改源
    if (audio.src !== window.location.origin + newSrc) {
      audio.src = newSrc;
      audio.load(); // 强制重新加载
    }

    // 设置音量
    audio.volume = 0.4;

    // 如果用户已经交互过，切换模式后重新播放
    if (hasUserInteracted) {
      const playAudio = () => {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("音乐播放成功");
              setIsPlaying(true);
            })
            .catch(err => {
              console.log("音频播放失败:", err);
            });
        }
      };

      // 延迟一点播放，确保音频源加载完成
      setTimeout(playAudio, 100);
    }
  }, [currentShape, hasUserInteracted]);

  // 用户交互后启动音乐
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !hasUserInteracted) return;

    console.log("检测到用户交互，启动音乐");
    
    // 尝试播放音频
    const playAudio = () => {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log("音乐播放成功");
            setIsPlaying(true);
          })
          .catch(err => {
            console.log("音频播放失败:", err);
          });
      }
    };

    // 立即尝试播放
    playAudio();

    return () => {
      // 清理
    };
  }, [hasUserInteracted]);

  return (
    <audio
      ref={audioRef}
      loop
      preload="auto"
    />
  );
};

const App: React.FC = () => {
  const [isCameraPinching, setIsCameraPinching] = useState(false);
  const [manualToggle, setManualToggle] = useState(false);
  const [showMediaOnly, setShowMediaOnly] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [status, setStatus] = useState<string>("Initializing...");
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<number>(0); // Used to force re-render of CameraHandler
  const [modeLocked, setModeLocked] = useState(false);
  const [showNearestMaterial, setShowNearestMaterial] = useState(false);
  
  const dragStart = useRef({ x: 0, y: 0 });
  const gestureTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentShape = (isCameraPinching || manualToggle) ? ShapeType.TREE : ShapeType.GALAXY;
  
  const isReady = status === "Ready";
  const hasError = !!error;

  // 监听用户交互来启动音乐
  useEffect(() => {
    const handleFirstInteraction = () => {
      if (!hasUserInteracted) {
        console.log("检测到用户交互，启动音乐");
        setHasUserInteracted(true);
        // 移除监听器，避免重复触发
        document.removeEventListener('click', handleFirstInteraction);
        document.removeEventListener('touchstart', handleFirstInteraction);
        document.removeEventListener('keydown', handleFirstInteraction);
      }
    };

    document.addEventListener('click', handleFirstInteraction, { once: true });
    document.addEventListener('touchstart', handleFirstInteraction, { once: true });
    document.addEventListener('keydown', handleFirstInteraction, { once: true });

    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [hasUserInteracted]);

  // 手势处理函数
  const handleGestureDetected = (gesture: GestureResult) => {
    console.log('手势检测:', gesture);
    
    // Check if any gesture is detected
    const anyGesture = gesture.fiveFingerPinch || gesture.twoFingerPinch || 
                      gesture.threeFingerPinch || gesture.upwardWave || 
                      gesture.downwardWave;
    
    if (anyGesture) {
      console.log('检测到手势活动');
    }

    // 1. 五指抓握显示圣诞树并锁定模式
    if (gesture.fiveFingerPinch) {
      console.log('检测到五指抓握，切换到圣诞树模式并锁定');
      setModeLocked(true);
      setManualToggle(true);
      return;
    }

    // 2. 五指向上挥动返回银河模式（如果模式已锁定）
    if (gesture.upwardWave && modeLocked) {
      console.log('检测到五指向上挥动，返回银河模式');
      setModeLocked(false);
      setManualToggle(false);
      setShowNearestMaterial(false);
      return;
    }

    // 3. 圣诞树模式下，两指捏合移动拖拽视角
    if (gesture.twoFingerPinch && currentShape === ShapeType.TREE) {
      console.log('检测到两指捏合，拖拽视角');
      // 这里可以实现更复杂的视角控制逻辑
      // 目前先简单记录位置变化
      return;
    }

    // 4. 三指捏合缩放功能
    if (gesture.threeFingerPinch) {
      console.log('检测到三指捏合，缩放视角:', gesture.zoomDirection);
      // 这里可以实现滚轮等效的缩放功能
      // 需要与OrbitControls集成
      return;
    }

    // 5. 五指向下挥动显示最近素材
    if (gesture.downwardWave && modeLocked && currentShape === ShapeType.TREE) {
      console.log('检测到五指向下挥动，切换最近素材显示');
      setShowNearestMaterial(prev => !prev);
      return;
    }
  };

  // Reset camera handler to re-request permissions
  const handleResetCamera = () => {
    console.log("Resetting camera handler...");
    setKey(prev => prev + 1); // Force re-render of CameraHandler
    setStatus("Initializing...");
    setError(null);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 5) {
      setManualToggle(prev => !prev);
    }
  };

  const handleClick = () => {
    setManualToggle(prev => !prev);
  };

  return (
    <div className="app-container">
      
      {/* 3D Scene Layer */}
      <div className="scene-layer">
        <Canvas 
          // Adjusted camera for smaller scale: closer position
          camera={{ position: [0, 16, 35], fov: 50 }} 
          gl={{ antialias: true, toneMappingExposure: 1.2 }} 
          dpr={[1, 2]} 
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onClick={handleClick}
        >
          <color attach="background" args={['#000000']} />
          
          {/* --- Lighting Setup --- */}
          
          <Environment preset="city" background={false} />

          {/* Scaled down light positions */}
          <directionalLight 
            position={[-25, 30, 20]} 
            intensity={8} 
            color="#ffffff" 
          />

          <ambientLight intensity={0.2} /> 
          
          {/* Adjusted point light distances */}
          <pointLight position={[0, 0, 0]} intensity={2} color="#ffaa00" distance={25} /> 
          <pointLight position={[20, -10, 0]} intensity={3} color="#4fc3f7" distance={40} /> 
          
          {/* Reduced star background radius. Hidden in Media Only mode. */}
          {!showMediaOnly && (
             <Stars radius={80} depth={50} count={1000} factor={4} saturation={0} fade speed={0.5} />
          )}
          
          <Suspense fallback={null}>
             <ParticleScene shape={currentShape} showMediaOnly={showMediaOnly} />
             <FloatingParticles visible={!showMediaOnly} />
             <ShootingStars visible={!showMediaOnly} />
          </Suspense>
          
          <OrbitControls 
            enablePan={false} 
            enableZoom={true} 
            minDistance={10} 
            maxDistance={80}
            autoRotate={currentShape === ShapeType.GALAXY && !showMediaOnly}
            autoRotateSpeed={0.15}
          />
        </Canvas>
      </div>

      {/* UI Overlay Layer - Minimalist */}
      <div className="ui-layer">
        {(!isReady && !hasError) && (
           <div className="loading-card">
             <div className="spinner" style={{width: '24px', height: '24px', border: '2px solid #ffffff33', borderTop: '2px solid #ffffff', borderRadius: '50%', animation: 'spin 1s linear infinite'}} />
             <span className="loading-text">{status}</span>
           </div>
        )}
      </div>

      {/* Background Music */}
      <BackgroundMusic currentShape={currentShape} hasUserInteracted={hasUserInteracted} />



      <CameraHandler 
        key={key}
        onGestureDetected={handleGestureDetected} 
        onStatusChange={setStatus}
        onError={setError}
        onReset={handleResetCamera}
      />

    </div>
  );
};

export default App;