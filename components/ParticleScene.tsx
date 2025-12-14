import React, { useMemo, useRef, useState, useEffect, Suspense, Component } from 'react';
import { useFrame, useThree, extend } from '@react-three/fiber';
import * as THREE from 'three';
import { shaderMaterial, Image, useVideoTexture, Billboard, useTexture, Text } from '@react-three/drei';
import { ShapeType } from '../types';

interface ParticleSceneProps {
  shape: ShapeType;
  showMediaOnly: boolean;
}

// Increased total count to support dense star and dense garland
const TOTAL_COUNT = 6200; 
const GALAXY_RADIUS = 18;
const TREE_HEIGHT = 14; 
const TREE_RADIUS = 8;

// Particle reservations for specific structures
const STAR_COUNT = 800;
const GARLAND_COUNT = 2500;

// --- Error Boundary for Media Gallery ---
interface ErrorBoundaryProps {
  children?: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    console.error("Component Error:", error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback || null;
    return this.props.children;
  }
}

// --- 0. Soft Halo Material ---
const HaloMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color(1.0, 0.6, 0.1), 
  },
  // Vertex Shader
  `
    varying vec2 vUv;
    varying float vScale;
    uniform float uTime;

    void main() {
      vUv = uv;
      vec4 worldPosition = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      
      vec3 scale = vec3(
        length(vec3(instanceMatrix[0].x, instanceMatrix[0].y, instanceMatrix[0].z)),
        length(vec3(instanceMatrix[1].x, instanceMatrix[1].y, instanceMatrix[1].z)),
        length(vec3(instanceMatrix[2].x, instanceMatrix[2].y, instanceMatrix[2].z))
      );
      vScale = scale.x;

      vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      
      // MODIFIED: Increased size to 6.0 (Doubled). Restored breathing amplitude to 0.15.
      float size = vScale * 6.0; 
      float breathe = 1.0 + 0.15 * sin(uTime * 3.0 + worldPosition.x * 10.0 + worldPosition.y * 5.0);
      size *= breathe;

      vec3 pos = worldPosition.xyz + (camRight * position.x + camUp * position.y) * size;
      gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
    }
  `,
  // Fragment Shader
  `
    varying vec2 vUv;
    uniform vec3 uColor;

    void main() {
      float d = length(vUv - 0.5);
      float alpha = smoothstep(0.5, 0.0, d);
      alpha = pow(alpha, 3.0); 
      
      if (alpha < 0.01) discard;
      
      vec3 core = vec3(1.0, 0.95, 0.8);
      vec3 col = mix(uColor, core, alpha * 0.4);
      
      gl_FragColor = vec4(col, alpha * 0.7); 
    }
  `
);

// --- 0.5 Meteor Material ---
const MeteorMaterial = shaderMaterial(
  {
    uTime: 0,
  },
  // Vertex
  `
    // Removed explicit instanceColor attribute to avoid redefinition error
    varying vec3 vInstanceColor;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      
      #ifdef USE_INSTANCING
        vInstanceColor = instanceColor;
      #else
        vInstanceColor = vec3(1.0);
      #endif
      
      vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  // Fragment
  `
    varying vec2 vUv;
    varying vec3 vInstanceColor;
    void main() {
      float alpha = smoothstep(0.0, 1.0, vUv.x);
      float shape = 1.0 - abs(vUv.y - 0.5) * 2.0;
      alpha *= shape;
      
      if (alpha < 0.01) discard;
      // Use instance color for dimming effect
      gl_FragColor = vec4(vInstanceColor, alpha);
    }
  `
);


// --- 1. Realistic Diffraction Spike Texture Generator ---
const useDiffractionTexture = () => {
  return useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    const cx = size / 2;
    const cy = size / 2;

    ctx.clearRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'screen'; 

    const drawSpike = (length: number, width: number, angleDeg: number, colorStart: string, colorEnd: string) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((angleDeg * Math.PI) / 180);
      
      const grad = ctx.createLinearGradient(0, 0, length, 0);
      grad.addColorStop(0, colorStart);
      grad.addColorStop(0.15, colorStart);
      grad.addColorStop(0.5, colorEnd);
      grad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, -width);
      ctx.lineTo(length, 0);
      ctx.lineTo(0, width);
      ctx.fill();
      ctx.restore();
    };

    const coreWhite = 'rgba(255, 255, 255, 1.0)';
    const warmGlow = 'rgba(255, 200, 100, 0.5)';
    const spectral = 'rgba(150, 200, 255, 0.3)'; 

    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.04);
    glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
    glow.addColorStop(0.5, 'rgba(255, 240, 220, 0.4)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.04, 0, Math.PI * 2);
    ctx.fill();

    drawSpike(size * 0.4, 2.0, 0, coreWhite, warmGlow);
    drawSpike(size * 0.4, 2.0, 90, coreWhite, warmGlow);
    drawSpike(size * 0.4, 2.0, 180, coreWhite, warmGlow);
    drawSpike(size * 0.4, 2.0, 270, coreWhite, warmGlow);

    const diagLen = size * 0.2;
    drawSpike(diagLen, 1.0, 45, warmGlow, spectral);
    drawSpike(diagLen, 1.0, 135, warmGlow, spectral);
    drawSpike(diagLen, 1.0, 225, warmGlow, spectral);
    drawSpike(diagLen, 1.0, 315, warmGlow, spectral);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);
};

// --- 2. Physics-Based Specular Shader ---
const PhysicalGlareMaterial = shaderMaterial(
  {
    uTime: 0,
    uTex: new THREE.Texture(),
    uLightPos: new THREE.Vector3(0, 0, 0), 
    uCamPos: new THREE.Vector3(0, 0, 0),   
  },
  // Vertex Shader
  `
    attribute vec3 aRandomNormal; 
    varying vec2 vUv;
    varying float vIntensity;
    uniform float uTime;
    uniform vec3 uLightPos;
    uniform vec3 uCamPos;

    void main() {
      vUv = uv;
      vec4 worldPosition = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      
      mat3 worldRotation = mat3(modelMatrix) * mat3(instanceMatrix);
      vec3 worldNormal = normalize(worldRotation * aRandomNormal);

      float particleScale = length(worldRotation[0]);
      vec3 surfacePos = worldPosition.xyz + (worldNormal * particleScale * 0.5);

      vec3 surfacePos = worldPosition.xyz + (worldNormal * particleScale * 0.5);

      vec3 viewDir = normalize(uCamPos - surfacePos);
      vec3 lightDir = normalize(uLightPos - surfacePos);
      vec3 halfVector = normalize(viewDir + lightDir); 

      float NdotH = max(0.0, dot(worldNormal, halfVector));
      
      // MODIFIED: Reduced specular power (30 -> 15) to widen reflection angle. 
      // This effectively doubles the number of visible glares.
      float specular = pow(NdotH, 15.0); 
      specular += pow(NdotH, 10.0) * 0.15;

      float breathe = sin(uTime * 3.0 + worldPosition.x * 0.5) * 0.3 + 0.7;
      vIntensity = specular * breathe * 4.0;

      vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

      // Glare size
      float glareSize = particleScale * (1.0 + vIntensity * 0.75); 
      vec3 offset = (camRight * position.x + camUp * position.y) * glareSize;
      vec3 finalPos = surfacePos + offset;
      
      finalPos += viewDir * (particleScale * 0.1);
      gl_Position = projectionMatrix * viewMatrix * vec4(finalPos, 1.0);
    }
  `,
  // Fragment Shader
  `
    uniform sampler2D uTex;
    varying vec2 vUv;
    varying float vIntensity;

    void main() {
      vec4 texColor = texture2D(uTex, vUv);
      if (texColor.a < 0.01 || vIntensity < 0.01) discard;

      vec3 hotWhite = vec3(1.0, 1.0, 1.0);
      vec3 golden   = vec3(1.0, 0.8, 0.1); 
      vec3 finalColor = mix(golden, hotWhite, texColor.a * vIntensity * 0.5);

      gl_FragColor = vec4(finalColor, texColor.a * min(vIntensity, 1.5));
    }
  `
);

extend({ PhysicalGlareMaterial, HaloMaterial, MeteorMaterial });

// --- Media Gallery Types & Data ---
type MediaType = 'image' | 'video';

interface MediaItem {
  id: number;
  type: MediaType;
  url: string;
  position?: THREE.Vector3;
}

// Replaced with reliable Picsum seeds to ensure visibility (Unsplash often blocks hotlinking)
const MEDIA_CONTENT: MediaItem[] = [
  // Travel / Stairs vibe
  { id: 1, type: 'image', url: 'https://picsum.photos/seed/travel/600/600' },
  // Couple / People
  { id: 2, type: 'image', url: 'https://picsum.photos/seed/love/600/600' },
  // Portrait
  { id: 3, type: 'image', url: 'https://picsum.photos/seed/person/600/600' },
  // City / Architecture
  { id: 4, type: 'image', url: 'https://picsum.photos/seed/city/600/600' },
  // Snow / Nature
  { id: 5, type: 'image', url: 'https://picsum.photos/seed/snow/600/600' },
  // Desert / Nature
  { id: 6, type: 'image', url: 'https://picsum.photos/seed/desert/600/600' },
  // Happy / Crowd
  { id: 7, type: 'image', url: 'https://picsum.photos/seed/friends/600/600' },
  // Video placeholder (VideoTexture usually handles CORS better if from CDN)
  { id: 8, type: 'video', url: 'https://cdn.pixabay.com/video/2021/04/13/70962-536647265_large.mp4' },
];

const calculateMediaPositions = () => {
  const items = [...MEDIA_CONTENT];
  const count = items.length;
  
  // Use Tree distribution logic to place them "inside"
  // Tree Params: Height 14, Radius 8 at bottom, 0 at top. Center roughly at 0.
  
  const yStart = -(TREE_HEIGHT / 2) + 2; // Start slightly above bottom
  const yEnd = (TREE_HEIGHT / 2) - 2;    // End slightly below top
  const totalY = yEnd - yStart;

  return items.map((item, i) => {
    // 1. Vertical distribution
    const t = i / (count - 1 || 1);
    const y = yStart + t * totalY;
    
    // 2. Calculate Cone Radius at this Y
    // Normalized height (0 at bottom, 1 at top)
    const relHeight = (y + (TREE_HEIGHT / 2)) / TREE_HEIGHT;
    const coneRadius = TREE_RADIUS * (1 - relHeight);
    
    // 3. Place "Inside" (50% of radius)
    const r = coneRadius * 0.5; 
    
    // 4. Spiral distribution
    const theta = i * 2.5; // Angle step in radians

    const x = r * Math.cos(theta);
    const z = r * Math.sin(theta);
    
    return { ...item, position: new THREE.Vector3(x, y, z) };
  });
};

// --- Media Components ---

// A reliable display component that doesn't rely on complex geometry scaling for visibility state
const HolographicPanel: React.FC<{ 
  texture: THREE.Texture, 
  item: MediaItem, 
  onClick: (e: any, item: MediaItem) => void,
  visible: boolean,
  isVideo?: boolean
}> = ({ texture, item, onClick, visible, isVideo }) => {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHover] = useState(false);
  const scaleRef = useRef(0);
  
  // Base scale for the panel - MODIFIED: Reduced to 0.5 (Half size)
  const BASE_SIZE = 0.5;

  useFrame((state, delta) => {
    if (groupRef.current) {
      // 1. Look at camera (Billboard behavior)
      groupRef.current.lookAt(state.camera.position);
      
      // 2. Floating animation
      const floatY = Math.sin(state.clock.elapsedTime + item.id) * 0.1; // Reduced float amplitude
      groupRef.current.position.y = (item.position?.y || 0) + floatY;

      // 3. Scale transition logic
      const targetScale = visible ? (hovered ? 1.5 : 1.0) : 0;
      scaleRef.current = THREE.MathUtils.lerp(scaleRef.current, targetScale, delta * 4);
      groupRef.current.scale.setScalar(scaleRef.current);
    }
  });

  return (
    <group 
      ref={groupRef} 
      position={item.position}
      onClick={(e) => { e.stopPropagation(); onClick(e, item); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); }}
      onPointerOut={() => setHover(false)}
    >
      {/* 1. Metal Frame / Backing - MODIFIED: Moved back to -0.05 to avoid Z-fighting */}
      <mesh position={[0, 0, -0.05]}>
         {/* Slightly larger than the image to create a border */}
         <boxGeometry args={[BASE_SIZE * 1.1, BASE_SIZE * 1.1, 0.02]} />
         <meshStandardMaterial 
            color={hovered ? "#ffffff" : "#cccccc"} 
            metalness={0.9}
            roughness={0.2}
            envMapIntensity={1.5}
         />
      </mesh>

      {/* 2. The Main Image/Video Plane - MODIFIED: Moved forward to 0.01 */}
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[BASE_SIZE, BASE_SIZE]} />
        <meshBasicMaterial 
          map={texture} 
          side={THREE.DoubleSide}
          toneMapped={false}
          transparent={true} // Allow round images if texture has transparency, though picsum usually doesn't
        />
      </mesh>
    </group>
  );
};

const ImageLoader: React.FC<{ item: MediaItem, onClick: any, visible: boolean }> = ({ item, onClick, visible }) => {
    // Standard Texture loading
    const texture = useTexture(item.url);
    return <HolographicPanel texture={texture} item={item} onClick={onClick} visible={visible} />;
};

const VideoLoader: React.FC<{ item: MediaItem, onClick: any, visible: boolean }> = ({ item, onClick, visible }) => {
    const texture = useVideoTexture(item.url, { muted: true, loop: true, start: true, playsInline: true });
    return <HolographicPanel texture={texture} item={item} onClick={onClick} visible={visible} isVideo />;
};

// --- Preview Components ---

const PreviewVideoPlane: React.FC<{ url: string }> = ({ url }) => {
  const texture = useVideoTexture(url, { 
    muted: false, 
    loop: true, 
    start: true, 
    playsInline: true 
  });
  
  useEffect(() => {
    const video = texture.image;
    if(video) {
        video.muted = false;
        video.volume = 1.0;
        video.play().catch((e: any) => console.log("Video play error", e));
    }
  }, [texture]);

  return (
    <mesh>
      <planeGeometry args={[1.6 * 2.5, 0.9 * 2.5]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
};

// MODIFIED: MediaGallery now accepts showMediaOnly prop
const MediaGallery: React.FC<{ shape: ShapeType, showMediaOnly: boolean }> = ({ shape, showMediaOnly }) => {
  const [activeItem, setActiveItem] = useState<MediaItem | null>(null);
  const itemsWithPos = useMemo(() => calculateMediaPositions(), []);
  
  const isTree = shape === ShapeType.TREE;
  const areItemsVisible = isTree || showMediaOnly;

  const handleItemClick = (e: any, item: MediaItem) => {
    if (!areItemsVisible) return;
    setActiveItem(item);
  };

  const closeExpanded = (e: any) => {
    e.stopPropagation();
    setActiveItem(null);
  };

  return (
    <>
      <group>
        {itemsWithPos.map((item) => (
           <React.Fragment key={item.id}>
             <Suspense fallback={
               // Fallback: A simple glowing box if texture loads slowly
               <mesh position={item.position} scale={areItemsVisible ? 1 : 0}>
                  <boxGeometry args={[0.5, 0.5, 0.5]} />
                  <meshBasicMaterial color="#555" wireframe />
               </mesh>
             }>
               {item.type === 'video' ? (
                  <VideoLoader item={item} onClick={handleItemClick} visible={areItemsVisible} />
               ) : (
                  <ImageLoader item={item} onClick={handleItemClick} visible={areItemsVisible} />
               )}
             </Suspense>
           </React.Fragment>
        ))}
      </group>

      {activeItem && (
        <group>
            {/* Fullscreen transparent plane to catch clicks for closing */}
            <mesh position={[0, 0, 15]} onClick={closeExpanded}>
                <planeGeometry args={[100, 100]} />
                {/* MODIFIED: Adjusted opacity to 0.6 so particles are still visible in background */}
                <meshBasicMaterial color="black" transparent opacity={0.6} />
            </mesh>
            
            <Billboard position={[0, 0, 20]} follow={true}>
                 {activeItem.type === 'image' ? (
                     <group scale={3}>
                        <Image url={activeItem.url} scale={[1.6, 1]} toneMapped={false} />
                        <Text 
                          position={[0, -0.6, 0.1]} 
                          fontSize={0.1} 
                          color="white"
                          anchorX="center"
                          anchorY="middle"
                        >
                          Click background to close
                        </Text>
                     </group>
                 ) : (
                    <group scale={3}>
                       <Suspense fallback={<meshBasicMaterial color="gray" />}>
                          <PreviewVideoPlane url={activeItem.url} />
                       </Suspense>
                    </group>
                 )}
            </Billboard>
        </group>
      )}
    </>
  );
};

export const ParticleScene: React.FC<ParticleSceneProps> = ({ shape, showMediaOnly }) => {
  const meshDiamondRef = useRef<THREE.InstancedMesh>(null); 
  const meshShardRef = useRef<THREE.InstancedMesh>(null);   
  const meshOrbRef = useRef<THREE.InstancedMesh>(null);
  // ADDED: Refs for new shapes
  const meshCubeRef = useRef<THREE.InstancedMesh>(null);
  const meshSphereRef = useRef<THREE.InstancedMesh>(null);

  const meshGlareRef = useRef<THREE.InstancedMesh>(null);
  const meshHaloRef = useRef<THREE.InstancedMesh>(null);
  
  const glareMatRef = useRef<THREE.ShaderMaterial>(null);
  const haloMatRef = useRef<THREE.ShaderMaterial>(null);
  
  const haloScaleFactor = useRef(0);

  const starTexture = useDiffractionTexture();
  const { camera } = useThree();
  const tempObject = new THREE.Object3D();
  
  const lightPos = new THREE.Vector3(-25, 30, 20);

  const { particles, counts, glareAttributes, haloIndices } = useMemo(() => {
    const data = [];
    // CHANGED: Initialize 5 counts for Diamond, Shard, Orb, Cube, Sphere
    const typeCounts = [0, 0, 0, 0, 0];
    
    const gIndices: number[] = [];
    const gNormals: number[] = [];
    const hIndices: number[] = [];

    const cCore = new THREE.Color('#ffecd2');    
    const cGold = new THREE.Color('#ffae42');    
    const cDust = new THREE.Color('#8b4513');    
    const cBlue = new THREE.Color('#4fc3f7');    
    const cDarkBlue = new THREE.Color('#1a237e'); 
    const cWhite = new THREE.Color('#ffffff');

    const colorTree = new THREE.Color('#10b981'); 
    const colorRed = new THREE.Color('#ef4444'); 
    const colorStar = new THREE.Color('#fff700'); 
    const colorGarlandGold = new THREE.Color('#fbbf24');
    const colorHighlight = new THREE.Color('#ffcc00'); 

    const branches = 5; 
    const spin = 1.5;   

    let lastHaloIndex = -100;
    const MIN_HALO_GAP = 15; 

    for (let i = 0; i < TOTAL_COUNT; i++) {
      // CHANGED: Randomly select from 5 shapes instead of 3
      const shapeType = Math.floor(Math.random() * 5);
      typeCounts[shapeType]++;
      
      gIndices.push(i);
      
      const v = new THREE.Vector3(
          Math.random() - 0.5, 
          Math.random() - 0.5, 
          Math.random() - 0.5
      ).normalize();
      gNormals.push(v.x, v.y, v.z);

      const t = Math.random();
      const radius = Math.pow(t, 1.2) * GALAXY_RADIUS; 
      const distRatio = radius / GALAXY_RADIUS;
      
      const branchAngle = (i % branches) * ((2 * Math.PI) / branches);
      const curveAngle = radius * 0.3 * spin;
      const randomSpread = (Math.random() - 0.5) * (0.5 + radius * 0.05); 
      
      const angle = branchAngle + curveAngle + randomSpread;

      // MODIFIED: Elliptical shape for galaxy (1.2 stretch on X axis)
      let gx = Math.cos(angle) * radius * 1.2;
      let gz = Math.sin(angle) * radius;
      let gy = (Math.random() - 0.5) * (2 + (GALAXY_RADIUS - radius) * 0.2) * 1.5;

      let tx, ty, tz;
      let tColor = new THREE.Color();
      let specificScaleMultiplier = 1.0;

      if (i < STAR_COUNT) {
         if (i === 0) {
             tx = 0;
             ty = (TREE_HEIGHT / 2) + 0.8;
             tz = 0;
             tColor.set('#ffffff'); 
             specificScaleMultiplier = 5.0; 
             hIndices.push(i); 
             
             gx = 0; gy = 0; gz = 0;
         } else {
             const rOuter = 0.9;  
             const rInner = 0.25; 
             
             const angle = Math.random() * Math.PI * 2;
             const angleShifted = angle - Math.PI / 2;
             
             const numSpikes = 5;
             let normTheta = angleShifted % (Math.PI * 2);
             if (normTheta < 0) normTheta += Math.PI * 2;
             
             const segmentStep = Math.PI / numSpikes; 
             const segmentIdx = Math.floor(normTheta / segmentStep);
             const t = (normTheta % segmentStep) / segmentStep;
             
             let maxR = 0;
             if (segmentIdx % 2 === 0) {
                 maxR = rOuter * (1 - t) + rInner * t;
             } else {
                 maxR = rInner * (1 - t) + rOuter * t;
             }
             
             const dist = Math.sqrt(Math.random()); 
             const r = dist * maxR;
             
             tx = r * Math.cos(angle);
             ty = r * Math.sin(angle) + (TREE_HEIGHT / 2) + 0.8;
             
             const distNorm = r / rOuter; 
             const zThickness = 0.6 * (1.0 - distNorm);
             tz = (Math.random() - 0.5) * zThickness; 
             
             tColor.copy(colorStar).lerp(cWhite, Math.random() * 0.3);
             
             const sizeGradient = 1.0 - (distNorm * 0.75); 
             specificScaleMultiplier = sizeGradient * (0.3 + Math.random() * 0.4);
         }
      } 
      else if (i < STAR_COUNT + GARLAND_COUNT) {
         const garlandIndex = i - STAR_COUNT;
         const progress = garlandIndex / GARLAND_COUNT; 
         
         const h = TREE_HEIGHT * (1 - progress); 
         const relHeight = h / TREE_HEIGHT;
         
         const pathRadius = (TREE_RADIUS * (1 - relHeight)) + 0.1; 
         
         const spirals = 3.0;
         const baseAngle = (progress * Math.PI * 2 * spirals);

         const spread = 0.8; 
         const rScatter = (Math.random() - 0.5) * spread;
         const hScatter = (Math.random() - 0.5) * spread;
         const aScatter = (Math.random() - 0.5) * 0.3; 

         tx = Math.cos(baseAngle + aScatter) * (pathRadius + rScatter);
         tz = Math.sin(baseAngle + aScatter) * (pathRadius + rScatter);
         ty = h - (TREE_HEIGHT / 2) + hScatter;
         
         let isHalo = false;
         
         if (i - lastHaloIndex > MIN_HALO_GAP) {
             if (Math.random() < 0.04) {
                 isHalo = true;
                 lastHaloIndex = i;
             }
         }

         if (isHalo) {
             tColor.copy(colorHighlight);
             specificScaleMultiplier = 1.0; 
             hIndices.push(i); 
         } else {
             if (Math.random() > 0.5) tColor.copy(colorRed);
             else tColor.copy(colorGarlandGold);
             specificScaleMultiplier = 0.5;
         }
      }
      else {
          const h = Math.random() * TREE_HEIGHT;
          const relHeight = h / TREE_HEIGHT;
          const maxRadiusAtHeight = TREE_RADIUS * (1 - relHeight);
          
          const r = maxRadiusAtHeight * Math.sqrt(Math.random()); 
          const theta = Math.random() * Math.PI * 2;
          
          tx = r * Math.cos(theta);
          tz = r * Math.sin(theta);
          ty = h - (TREE_HEIGHT / 2);

          const isOrnament = Math.random() > 0.95;
          if (isOrnament) {
              const ornType = Math.random();
              if (ornType > 0.6) tColor.copy(colorRed);
              else if (ornType > 0.3) tColor.copy(colorGarlandGold);
              else tColor.copy(cWhite);
          } else {
              tColor.copy(colorTree).lerp(new THREE.Color('#059669'), Math.random());
          }
          specificScaleMultiplier = (1 - distRatio * 0.4);
      }

      let gColor = new THREE.Color();
      const noise = Math.random();

      if (distRatio < 0.15) gColor.copy(cCore).lerp(cGold, noise * 0.5);
      else if (distRatio < 0.5) {
        if (noise > 0.6) gColor.copy(cDust);
        else gColor.copy(cGold).lerp(cWhite, 0.3);
      } else {
        if (noise > 0.7) gColor.copy(cDarkBlue).lerp(cDust, 0.5);
        else gColor.copy(cBlue).lerp(cWhite, Math.random() * 0.5);
      }

      const rotationSpeed = {
        x: (Math.random() - 0.5) * 0.03, 
        y: (Math.random() - 0.5) * 0.03,
        z: (Math.random() - 0.5) * 0.03
      };

      const baseScale = (Math.random() * 0.35 + 0.08); 
      
      data.push({
        shapeType,
        currentPos: new THREE.Vector3(gx, gy, gz),
        targetPos: { galaxy: new THREE.Vector3(gx, gy, gz), tree: new THREE.Vector3(tx, ty, tz) },
        currentColor: gColor.clone(),
        targetColor: { galaxy: gColor, tree: tColor },
        rotation: new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, 0),
        rotationSpeed,
        scale: baseScale * specificScaleMultiplier
      });
    }

    return { 
        particles: data, 
        counts: typeCounts, 
        glareAttributes: {
            indices: gIndices,
            normals: new Float32Array(gNormals)
        },
        haloIndices: hIndices
    };
  }, []);

  useFrame((state, delta) => {
    // ADDED: Checks for new refs
    if (!meshDiamondRef.current || !meshShardRef.current || !meshOrbRef.current || !meshCubeRef.current || !meshSphereRef.current) return;

    if (glareMatRef.current) {
        glareMatRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
        glareMatRef.current.uniforms.uCamPos.value.copy(camera.position);
        glareMatRef.current.uniforms.uLightPos.value.copy(lightPos);
    }
    
    if (haloMatRef.current) {
        haloMatRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
    }

    const lerpFactor = THREE.MathUtils.clamp(delta * 2.0, 0, 1);
    
    const targetHaloScale = shape === ShapeType.TREE ? 1.0 : 0.0;
    haloScaleFactor.current = THREE.MathUtils.lerp(haloScaleFactor.current, targetHaloScale, delta * 3.0);

    const rotSpeed = delta * 0.04;

    const newRotY = meshDiamondRef.current.rotation.y + rotSpeed;
    meshDiamondRef.current.rotation.y = newRotY;
    meshShardRef.current.rotation.y = newRotY;
    meshOrbRef.current.rotation.y = newRotY;
    // ADDED: Rotate new meshes
    meshCubeRef.current.rotation.y = newRotY;
    meshSphereRef.current.rotation.y = newRotY;
    
    if (meshGlareRef.current) meshGlareRef.current.rotation.y = newRotY;
    if (meshHaloRef.current) meshHaloRef.current.rotation.y = newRotY;

    let idx0 = 0;
    let idx1 = 0;
    let idx2 = 0;
    // ADDED: Counters for new shapes
    let idx3 = 0;
    let idx4 = 0;

    particles.forEach((particle, i) => {
      const target = shape === ShapeType.TREE ? particle.targetPos.tree : particle.targetPos.galaxy;
      particle.currentPos.lerp(target, lerpFactor);

      const targetCol = shape === ShapeType.TREE ? particle.targetColor.tree : particle.targetColor.galaxy;
      particle.currentColor.lerp(targetCol, lerpFactor);

      particle.rotation.x += particle.rotationSpeed.x;
      particle.rotation.y += particle.rotationSpeed.y;
      
      tempObject.position.copy(particle.currentPos);
      tempObject.rotation.copy(particle.rotation);
      
      // Hide the solid geometry for the central star (index 0) to leave only the glare/halo, 
      // otherwise use the normal particle scale.
      const geomScale = (i === 0) ? 0 : particle.scale;
      tempObject.scale.setScalar(geomScale);
      
      tempObject.updateMatrix();

      if (particle.shapeType === 0) {
        meshDiamondRef.current!.setMatrixAt(idx0, tempObject.matrix);
        meshDiamondRef.current!.setColorAt(idx0, particle.currentColor);
        idx0++;
      } else if (particle.shapeType === 1) {
        meshShardRef.current!.setMatrixAt(idx1, tempObject.matrix);
        meshShardRef.current!.setColorAt(idx1, particle.currentColor);
        idx1++;
      } else if (particle.shapeType === 2) {
        meshOrbRef.current!.setMatrixAt(idx2, tempObject.matrix);
        meshOrbRef.current!.setColorAt(idx2, particle.currentColor);
        idx2++;
      } 
      // ADDED: Logic for Cubes (Type 3) and Spheres (Type 4)
      else if (particle.shapeType === 3) {
        meshCubeRef.current!.setMatrixAt(idx3, tempObject.matrix);
        meshCubeRef.current!.setColorAt(idx3, particle.currentColor);
        idx3++;
      } else {
        meshSphereRef.current!.setMatrixAt(idx4, tempObject.matrix);
        meshSphereRef.current!.setColorAt(idx4, particle.currentColor);
        idx4++;
      }
    });

    if (meshGlareRef.current) {
        glareAttributes.indices.forEach((particleIndex, i) => {
            const particle = particles[particleIndex];
            tempObject.position.copy(particle.currentPos);
            tempObject.rotation.copy(particle.rotation);
            tempObject.scale.setScalar(particle.scale);
            tempObject.updateMatrix();
            meshGlareRef.current!.setMatrixAt(i, tempObject.matrix);
        });
        meshGlareRef.current.instanceMatrix.needsUpdate = true;
    }
    
    if (meshHaloRef.current) {
        haloIndices.forEach((particleIndex, i) => {
            const particle = particles[particleIndex];
            tempObject.position.copy(particle.currentPos);
            tempObject.rotation.set(0, 0, 0); 
            
            const s = particle.scale * haloScaleFactor.current;
            tempObject.scale.setScalar(s);
            
            tempObject.updateMatrix();
            meshHaloRef.current!.setMatrixAt(i, tempObject.matrix);
        });
        meshHaloRef.current.instanceMatrix.needsUpdate = true;
    }

    meshDiamondRef.current.instanceMatrix.needsUpdate = true;
    if (meshDiamondRef.current.instanceColor) meshDiamondRef.current.instanceColor.needsUpdate = true;
    
    meshShardRef.current.instanceMatrix.needsUpdate = true;
    if (meshShardRef.current.instanceColor) meshShardRef.current.instanceColor.needsUpdate = true;
    
    meshOrbRef.current.instanceMatrix.needsUpdate = true;
    if (meshOrbRef.current.instanceColor) meshOrbRef.current.instanceColor.needsUpdate = true;

    // ADDED: Update flags for new meshes
    meshCubeRef.current.instanceMatrix.needsUpdate = true;
    if (meshCubeRef.current.instanceColor) meshCubeRef.current.instanceColor.needsUpdate = true;

    meshSphereRef.current.instanceMatrix.needsUpdate = true;
    if (meshSphereRef.current.instanceColor) meshSphereRef.current.instanceColor.needsUpdate = true;
  });

  const materialProps = {
    roughness: 0.1,      
    metalness: 0.9,      
    flatShading: true,   
    emissive: new THREE.Color("#000000"),
    envMapIntensity: 1.5
  };

  return (
    <group>
      <instancedMesh ref={meshDiamondRef} args={[undefined, undefined, counts[0]]} visible={!showMediaOnly}>
        <octahedronGeometry args={[0.5, 0]} /> 
        <meshStandardMaterial {...materialProps} />
      </instancedMesh>

      <instancedMesh ref={meshShardRef} args={[undefined, undefined, counts[1]]} visible={!showMediaOnly}>
        <tetrahedronGeometry args={[0.4, 0]} /> 
        <meshStandardMaterial {...materialProps} />
      </instancedMesh>

      <instancedMesh ref={meshOrbRef} args={[undefined, undefined, counts[2]]} visible={!showMediaOnly}>
        <icosahedronGeometry args={[0.3, 0]} /> 
        <meshStandardMaterial {...materialProps} flatShading={true} />
      </instancedMesh>

      {/* ADDED: Cube InstancedMesh */}
      <instancedMesh ref={meshCubeRef} args={[undefined, undefined, counts[3]]} visible={!showMediaOnly}>
        <boxGeometry args={[0.35, 0.35, 0.35]} /> 
        <meshStandardMaterial {...materialProps} />
      </instancedMesh>

      {/* ADDED: Sphere InstancedMesh */}
      <instancedMesh ref={meshSphereRef} args={[undefined, undefined, counts[4]]} visible={!showMediaOnly}>
        <sphereGeometry args={[0.25, 12, 12]} /> 
        <meshStandardMaterial {...materialProps} />
      </instancedMesh>

      <instancedMesh ref={meshGlareRef} args={[undefined, undefined, glareAttributes.indices.length]} visible={!showMediaOnly}>
        <planeGeometry args={[1, 1]}>
             <instancedBufferAttribute 
                attach="attributes-aRandomNormal" 
                args={[glareAttributes.normals, 3]} 
             />
        </planeGeometry>
        {/* @ts-ignore */}
        <physicalGlareMaterial 
            ref={glareMatRef} 
            transparent={true}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            uTex={starTexture}
        />
      </instancedMesh>
      
      <instancedMesh ref={meshHaloRef} args={[undefined, undefined, haloIndices.length]} visible={!showMediaOnly}>
        <planeGeometry args={[1, 1]} />
        {/* @ts-ignore */}
        <haloMaterial 
            ref={haloMatRef}
            transparent={true}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
        />
      </instancedMesh>

      {/* --- ADDED MEDIA GALLERY WITH ERROR BOUNDARY & ISOLATED SUSPENSE --- */}
      <ErrorBoundary fallback={null}>
            <MediaGallery shape={shape} showMediaOnly={showMediaOnly} />
      </ErrorBoundary>
    </group>
  );
};

export const FloatingParticles: React.FC<{ visible?: boolean }> = ({ visible = true }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const DUST_COUNT = 2000;
  const tempObject = new THREE.Object3D();

  const dustData = useMemo(() => {
    const data = [];
    for (let i = 0; i < DUST_COUNT; i++) {
      const r = Math.sqrt(Math.random()) * 80; 
      const theta = Math.random() * Math.PI * 2;
      const ySpread = (Math.random() - 0.5) * 40; 
      
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);
      const y = ySpread;
      const speed = (Math.random() * 0.01) + 0.005; 
      
      const color = new THREE.Color('#e0e0e0').lerp(new THREE.Color('#ffffff'), Math.random());

      data.push({ 
        initialPos: new THREE.Vector3(x, y, z),
        radius: Math.sqrt(x*x + z*z),
        angle: theta,
        y: y,
        speed, 
        scale: Math.random() * 0.2 + 0.05, 
        color,
        rotationSpeed: {
            x: (Math.random() - 0.5) * 0.002, 
            y: (Math.random() - 0.5) * 0.002
        }
      });
    }
    return data;
  }, []);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    dustData.forEach((d, i) => {
      d.angle += d.speed * delta * 0.25; 
      const nx = Math.cos(d.angle) * d.radius;
      const nz = Math.sin(d.angle) * d.radius;
      const time = state.clock.getElapsedTime();
      
      const ny = d.y + Math.sin(time * 0.25 + d.radius) * 2;
      
      tempObject.position.set(nx, ny, nz);
      tempObject.rotation.x += d.rotationSpeed.x;
      tempObject.rotation.y += d.rotationSpeed.y;
      tempObject.scale.setScalar(d.scale);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
      meshRef.current!.setColorAt(i, d.color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, DUST_COUNT]} visible={visible}>
      <octahedronGeometry args={[0.5, 0]} />
      <meshStandardMaterial 
        roughness={0.0} 
        metalness={1.0} 
        flatShading={true}
        emissive="#ffffff"
        emissiveIntensity={0.15}
        envMapIntensity={2.0}
      />
    </instancedMesh>
  );
};

export const ShootingStars: React.FC<{ visible?: boolean }> = ({ visible = true }) => {
    // Increased pool size to 6 to handle up to 3 active + overlapping fade-outs
    const count = 6; 
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const tempObj = new THREE.Object3D();
    
    // Master controller for burst timing
    const controller = useRef({
        nextSpawnTime: 0,
        burstRemaining: 0, // How many meteors left in current burst
    });
    
    // Maintain state for each meteor
    const meteors = useRef(
        new Array(count).fill(0).map(() => ({
            active: false,
            startTime: 0,
            pos: new THREE.Vector3(),
            dir: new THREE.Vector3(),
            speed: 0,
            life: 0,
            scale: 0,
            fadeDuration: 0 // ADDED: Random fade duration
        }))
    );
    
    // Initialize controller.nextSpawnTime on mount
    useEffect(() => {
        controller.current.nextSpawnTime = 2.0; 
        
        // ADDED: Initialize all meteors to White so they aren't invisible (black) initially
        if (meshRef.current) {
            const white = new THREE.Color(1, 1, 1);
            for (let i = 0; i < count; i++) {
                meshRef.current.setColorAt(i, white);
            }
            if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
        }
    }, []);

    useFrame((state, delta) => {
        if (!meshRef.current) return;
        const camera = state.camera;
        const time = state.clock.getElapsedTime();

        // --- Spawning Logic ---
        if (time > controller.current.nextSpawnTime) {
            
            // If starting a new burst, determine the count
            if (controller.current.burstRemaining === 0) {
                 controller.current.burstRemaining = 1 + Math.floor(Math.random() * 3); // 1 to 3
            }

            // Find an inactive meteor in the pool
            const availableMeteor = meteors.current.find(m => !m.active);
            
            if (availableMeteor) {
                // MODIFIED: Shortened fade duration and total life by half
                const fadeDuration = (Math.random() * 1.5) * 0.5;
                const life = 0.4 + Math.random() * 0.2 + fadeDuration; // Ensure life includes fade time
                
                availableMeteor.active = true;
                availableMeteor.startTime = time;
                availableMeteor.life = life;
                availableMeteor.fadeDuration = fadeDuration;
                // CHANGED: Increased speed to 50-60
                availableMeteor.speed = 50 + Math.random() * 10; 
                
                // MODIFIED: Increased scale to 2.5 to be visible at greater distance
                availableMeteor.scale = 2.5; 

                // --- Calculate Camera-Relative Position ---
                // Get Camera Basis Vectors
                const matrix = camera.matrixWorld;
                const right = new THREE.Vector3().setFromMatrixColumn(matrix, 0).normalize();
                const up = new THREE.Vector3().setFromMatrixColumn(matrix, 1).normalize();
                const backward = new THREE.Vector3().setFromMatrixColumn(matrix, 2).normalize(); // +Z is backward in Camera space
                const forward = backward.clone().negate(); // View direction

                // Define Background Plane Center: Subject (0,0,0) + Forward * Distance
                // MODIFIED: Distance 200-250 (Further back)
                const bgDist = 200 + Math.random() * 50; 
                const spawnPlaneCenter = forward.clone().multiplyScalar(bgDist);
                
                // Randomize Start Position on this plane (Right/Up basis)
                const isLeftToRight = Math.random() > 0.5;
                // Increased offset to account for greater distance and perspective
                const xOffset = 50 + (bgDist - 60) * 0.5; 
                const startX = isLeftToRight ? -xOffset : xOffset;
                const startY = 10 + Math.random() * 20; 
                
                const pos = new THREE.Vector3().copy(spawnPlaneCenter)
                    .add(right.clone().multiplyScalar(startX))
                    .add(up.clone().multiplyScalar(startY));

                // --- Calculate Direction ---
                // Angle 10-30 deg downwards relative to the "Right" vector
                // CHANGED: Angle to 10-30 degrees
                const angleDeg = 10 + Math.random() * 20;
                const angleRad = THREE.MathUtils.degToRad(angleDeg);
                
                // Direction components in plane basis
                const dx = Math.cos(angleRad) * (isLeftToRight ? 1 : -1);
                const dy = -Math.sin(angleRad);
                
                const dir = new THREE.Vector3()
                    .add(right.clone().multiplyScalar(dx))
                    .add(up.clone().multiplyScalar(dy))
                    .normalize();

                availableMeteor.pos.copy(pos);
                availableMeteor.dir.copy(dir);

                // Set initial color (White)
                meshRef.current.setColorAt(meteors.current.indexOf(availableMeteor), new THREE.Color(1,1,1));

                // Decrement burst count
                controller.current.burstRemaining--;

                // Determine next spawn time
                if (controller.current.burstRemaining > 0) {
                    // Still in a burst, schedule next one quickly (< 500ms)
                    controller.current.nextSpawnTime = time + 0.1 + Math.random() * 0.4;
                } else {
                    // Burst finished.
                    // Interval: 2s - 5s AFTER this meteor ends
                    const interval = 2.0 + Math.random() * 3.0; // 2 to 5
                    controller.current.nextSpawnTime = time + life + interval;
                }
            } else {
                // No pool available, retry very soon
                 controller.current.nextSpawnTime = time + 0.1;
            }
        }

        // --- Update & Render Logic ---
        meteors.current.forEach((m, i) => {
            if (m.active) {
                const elapsed = time - m.startTime;
                
                // Move
                m.pos.addScaledVector(m.dir, m.speed * delta);
                
                // Construct Rotation Matrix for Trail Billboard
                const xDir = m.dir.clone();
                const zDir = new THREE.Vector3().subVectors(camera.position, m.pos).normalize(); 
                const yDir = new THREE.Vector3().crossVectors(zDir, xDir).normalize();
                const finalZ = new THREE.Vector3().crossVectors(xDir, yDir).normalize();
                
                const rotMatrix = new THREE.Matrix4().makeBasis(xDir, yDir, finalZ);
                rotMatrix.setPosition(m.pos);

                // ADDED: Dimming Logic
                const timeRemaining = m.life - elapsed;
                let brightness = 1.0;
                
                // Start dimming in the last 'fadeDuration' seconds
                if (timeRemaining < m.fadeDuration && m.fadeDuration > 0) {
                     brightness = timeRemaining / m.fadeDuration;
                }
                brightness = THREE.MathUtils.clamp(brightness, 0, 1);
                
                // Update Color for Dimming
                const c = new THREE.Color(brightness, brightness, brightness);
                meshRef.current!.setColorAt(i, c);

                const s = m.scale; 
                const scaleMatrix = new THREE.Matrix4().makeScale(s, s, s);
                
                // Combine into final matrix
                tempObj.matrix.multiplyMatrices(rotMatrix, scaleMatrix);
                
                meshRef.current!.setMatrixAt(i, tempObj.matrix);

                // Die
                if (elapsed > m.life) {
                    m.active = false;
                    tempObj.matrix.identity().scale(new THREE.Vector3(0,0,0));
                    meshRef.current!.setMatrixAt(i, tempObj.matrix);
                }
            } else {
                // Ensure inactive ones are hidden
                tempObj.matrix.identity().scale(new THREE.Vector3(0,0,0));
                meshRef.current!.setMatrixAt(i, tempObj.matrix);
            }
        });
        
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]} visible={visible}>
            {/* Length along X-axis (16), Width along Y-axis (0.4) */}
            <planeGeometry args={[16, 0.4]} />
            {/* @ts-ignore */}
            <meteorMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </instancedMesh>
    );
};

export default ParticleScene;