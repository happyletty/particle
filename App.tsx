import React, { useState, Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Environment } from '@react-three/drei';
import { ParticleScene, FloatingParticles, ShootingStars } from './components/ParticleScene';
import CameraHandler from './components/CameraHandler';
import { ShapeType } from './types';
import { Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [isCameraPinching, setIsCameraPinching] = useState(false);
  const [manualToggle, setManualToggle] = useState(false);
  // ADDED: State for media isolation mode
  const [showMediaOnly, setShowMediaOnly] = useState(false);
  
  const [status, setStatus] = useState<string>("Initializing...");
  const [error, setError] = useState<string | null>(null);

  const dragStart = useRef({ x: 0, y: 0 });

  const currentShape = (isCameraPinching || manualToggle) ? ShapeType.TREE : ShapeType.GALAXY;
  
  const isReady = status === "Ready";
  const hasError = !!error;

  const handlePointerDown = (e: React.PointerEvent) => {
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMissed = (event: MouseEvent) => {
    const dx = event.clientX - dragStart.current.x;
    const dy = event.clientY - dragStart.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 5) {
      setManualToggle(prev => !prev);
    }
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
          onPointerMissed={handlePointerMissed}
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
        {!isReady && !hasError && (
           <div className="loading-card">
             <Loader2 className="spinner" />
             <span className="loading-text">{status}</span>
           </div>
        )}
      </div>

      {/* ADDED: Top Right Debug Button */}
      <button 
        style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            zIndex: 60,
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            background: showMediaOnly ? '#ef4444' : 'rgba(255, 255, 255, 0.15)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            backdropFilter: 'blur(4px)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            fontSize: '1.2rem'
        }}
        onClick={(e) => {
            e.stopPropagation();
            setShowMediaOnly(!showMediaOnly);
        }}
        title="Toggle Media Only Mode"
      >
        D
      </button>

      <CameraHandler 
        onPinchChange={setIsCameraPinching} 
        onStatusChange={setStatus}
        onError={setError}
      />

    </div>
  );
};

export default App;