import React, { useState, Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import ParticleScene from './components/ParticleScene';
import CameraHandler from './components/CameraHandler';
import { ShapeType } from './types';
import { Sparkles, Loader2 } from 'lucide-react';

const App: React.FC = () => {
  // We separate sources of input
  const [isCameraPinching, setIsCameraPinching] = useState(false);
  const [manualToggle, setManualToggle] = useState(false); // Changed to toggle state
  
  const [status, setStatus] = useState<string>("Initializing...");
  const [error, setError] = useState<string | null>(null);

  // Drag detection refs
  const dragStart = useRef({ x: 0, y: 0 });

  // Combine inputs: either camera pinch OR manual toggle is active
  const currentShape = (isCameraPinching || manualToggle) ? ShapeType.TREE : ShapeType.GALAXY;
  
  // Logic to hide loader: If ready OR if there's an error (we just hide loader silently on error)
  const isReady = status === "Ready";
  const hasError = !!error;

  const handlePointerDown = (e: React.PointerEvent) => {
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // Calculate distance moved
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Only toggle if it's a click (not a drag)
    if (distance < 5) {
      setManualToggle(prev => !prev);
    }
  };

  return (
    <div 
      className="relative w-full h-[100dvh] bg-black text-white overflow-hidden font-sans cursor-pointer"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      title="Click to toggle shape"
    >
      
      {/* 3D Scene Layer */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 20, 50], fov: 60 }}>
          <color attach="background" args={['#050510']} />
          <ambientLight intensity={0.5} />
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
          <Suspense fallback={null}>
             <ParticleScene shape={currentShape} />
          </Suspense>
          <OrbitControls 
            enablePan={false} 
            enableZoom={true} 
            minDistance={20} 
            maxDistance={100}
            autoRotate={currentShape === ShapeType.GALAXY}
            autoRotateSpeed={0.5}
          />
        </Canvas>
      </div>

      {/* UI Overlay Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6">
        
        {/* Header */}
        <header className="flex items-center space-x-3 opacity-60 hover:opacity-100 transition-opacity duration-300">
          <div className="p-2 bg-indigo-600/50 rounded-lg shadow-lg shadow-indigo-500/20 backdrop-blur-sm">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-400">
              Nebula Morph
            </h1>
          </div>
        </header>

        {/* Status Loader Only - No permanent status pill */}
        <div className="flex flex-col items-center justify-center space-y-6">
            {!isReady && !hasError && (
               <div className="flex items-center space-x-2 bg-black/40 backdrop-blur-md px-6 py-3 rounded-full border border-white/5">
                 <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                 <span className="text-xs font-medium text-white/50">{status}</span>
               </div>
            )}
        </div>

        {/* Empty Footer */}
        <div className="h-4"></div>
      </div>

      {/* Logic Container */}
      <CameraHandler 
        onPinchChange={setIsCameraPinching} 
        onStatusChange={setStatus}
        onError={setError}
      />

    </div>
  );
};

export default App;