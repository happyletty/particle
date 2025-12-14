import React, { useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import ParticleScene from './components/ParticleScene';
import CameraHandler from './components/CameraHandler';
import { ShapeType } from './types';
import { Hand, Trees, Sparkles, AlertCircle, Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [currentShape, setCurrentShape] = useState<ShapeType>(ShapeType.GALAXY);
  const [status, setStatus] = useState<string>("Initializing...");
  const [error, setError] = useState<string | null>(null);

  const isReady = status === "Ready";

  return (
    <div className="relative w-full h-[100dvh] bg-black text-white overflow-hidden font-sans">
      
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
        <header className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/30">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-400">
              Nebula Morph
            </h1>
            <p className="text-xs text-indigo-300 opacity-80">
              Powered by Three.js & MediaPipe
            </p>
          </div>
        </header>

        {/* Status / Instructions */}
        <div className="flex flex-col items-center justify-center space-y-6">
            {!isReady && !error && (
               <div className="flex items-center space-x-2 bg-black/60 backdrop-blur-md px-6 py-3 rounded-full border border-white/10">
                 <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                 <span className="text-sm font-medium">{status}</span>
               </div>
            )}

            {error && (
              <div className="flex items-center space-x-2 bg-red-900/80 backdrop-blur-md px-6 py-4 rounded-xl border border-red-500/50 max-w-md">
                 <AlertCircle className="w-6 h-6 text-red-300 flex-shrink-0" />
                 <span className="text-sm text-red-100">{error}</span>
              </div>
            )}

            {isReady && (
              <div className="transition-all duration-500 ease-in-out transform">
                  <div className={`flex items-center space-x-4 bg-black/40 backdrop-blur-xl px-8 py-4 rounded-2xl border border-white/10 shadow-2xl ${currentShape === ShapeType.TREE ? 'border-emerald-500/50 bg-emerald-900/20' : ''}`}>
                    
                    {/* Status Indicator Icon */}
                    <div className={`p-3 rounded-full transition-colors duration-300 ${currentShape === ShapeType.TREE ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/50'}`}>
                       <Trees className="w-6 h-6" />
                    </div>

                    <div className="flex flex-col">
                      <span className="text-xs uppercase tracking-wider text-white/40 font-bold mb-1">
                        Current State
                      </span>
                      <span className={`text-xl font-bold transition-all duration-300 ${currentShape === ShapeType.TREE ? 'text-emerald-300' : 'text-indigo-300'}`}>
                        {currentShape === ShapeType.TREE ? 'Christmas Tree' : 'Cosmic Galaxy'}
                      </span>
                    </div>

                    <div className="h-8 w-px bg-white/10 mx-4" />

                    <div className="flex items-center space-x-3 opacity-90">
                       <Hand className="w-5 h-5 text-indigo-300" />
                       <span className="text-sm max-w-[140px] leading-tight">
                         Pinch 5 fingers to transform
                       </span>
                    </div>

                  </div>
              </div>
            )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-end">
           <div className="text-xs text-white/30 max-w-xs">
              Allow camera access. Keep hand 1-2 feet from camera. Bring all 5 fingertips together.
           </div>
        </div>
      </div>

      {/* Logic Container */}
      <CameraHandler 
        onShapeChange={setCurrentShape} 
        onStatusChange={setStatus}
        onError={setError}
      />

    </div>
  );
};

export default App;