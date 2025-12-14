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
  
  const [status, setStatus] = useState<string>("Initializing...");
  const [error, setError] = useState<string | null>(null);

  const dragStart = useRef({ x: 0, y: 0 });

  const currentShape = (isCameraPinching || manualToggle) ? ShapeType.TREE : ShapeType.GALAXY;
  
  const isReady = status === "Ready";
  const hasError = !!error;

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

  return (
    <div 
      className="relative w-full h-[100dvh] bg-black text-white overflow-hidden font-sans cursor-pointer"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      
      {/* 3D Scene Layer */}
      <div className="absolute inset-0 z-0">
        <Canvas 
          // Adjusted camera for smaller scale: closer position
          camera={{ position: [0, 16, 35], fov: 50 }} 
          gl={{ antialias: true, toneMappingExposure: 1.2 }} 
          dpr={[1, 2]} 
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
          
          {/* Reduced star background radius */}
          <Stars radius={80} depth={50} count={1000} factor={4} saturation={0} fade speed={0.5} />
          
          <Suspense fallback={null}>
             <ParticleScene shape={currentShape} />
             <FloatingParticles />
             <ShootingStars />
          </Suspense>
          
          <OrbitControls 
            enablePan={false} 
            enableZoom={true} 
            minDistance={10} 
            maxDistance={80}
            autoRotate={currentShape === ShapeType.GALAXY}
            autoRotateSpeed={0.15}
          />
        </Canvas>
      </div>

      {/* UI Overlay Layer - Minimalist */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center">
        {!isReady && !hasError && (
           <div className="flex flex-col items-center space-y-3 p-6 rounded-2xl bg-black/20 backdrop-blur-xl border border-white/10">
             <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
             <span className="text-sm font-light text-white/70 tracking-widest uppercase">{status}</span>
           </div>
        )}
      </div>

      <CameraHandler 
        onPinchChange={setIsCameraPinching} 
        onStatusChange={setStatus}
        onError={setError}
      />

    </div>
  );
};

export default App;