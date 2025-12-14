import React, { useMemo, useRef, useState, useEffect, Suspense, Component } from 'react';
import { useFrame, useThree, extend } from '@react-three/fiber';
import * as THREE from 'three';
import { shaderMaterial, Image, useVideoTexture, Billboard } from '@react-three/drei';
import { ShapeType } from '../types';

interface ParticleSceneProps {
  shape: ShapeType;
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
    uColor: new THREE.Color(1.0, 1.0, 1.0),
  },
  // Vertex
  `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      // Use standard modelViewMatrix combined with instanceMatrix
      // This works because Three.js handles the instanceMatrix attribute automatically for InstancedMesh
      vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  // Fragment
  `
    varying vec2 vUv;
    uniform vec3 uColor;
    void main() {
      float alpha = smoothstep(0.0, 1.0, vUv.x);
      float shape = 1.0 - abs(vUv.y - 0.5) * 2.0;
      alpha *= shape;
      
      if (alpha < 0.01) discard;
      gl_FragColor = vec4(uColor, alpha);
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

      vec3 viewDir = normalize(uCamPos - surfacePos);
      vec3 lightDir = normalize(uLightPos - surfacePos);
      vec3 halfVector = normalize(viewDir + lightDir); 

      float NdotH = max(0.0, dot(worldNormal, halfVector));
      float specular = pow(NdotH, 60.0); 
      specular += pow(NdotH, 20.0) * 0.15;

      float breathe = sin(uTime * 3.0 + worldPosition.x * 0.5) * 0.3 + 0.7;
      vIntensity = specular * breathe * 4.0;

      vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

      // Reduced glare size by half as requested: (2.0 + ...) -> (1.0 + ...)
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

const MEDIA_CONTENT: MediaItem[] = [
  { id: 1, type: 'image', url: 'https://images.unsplash.com/photo-1544967082-d9d3fdd01a15?w=500&q=80' }, 
  { id: 2, type: 'video', url: 'https://cdn.pixabay.com/video/2019/12/12/29965-379255282_large.mp4' }, 
  { id: 3, type: 'image', url: 'https://images.unsplash.com/photo-1512474932049-78ac69ede12c?w=500&q=80' }, 
  { id: 4, type: 'image', url: 'https://images.unsplash.com/photo-1482517967863-00e15c9b4499?w=500&q=80' }, 
  { id: 5, type: 'video', url: 'https://cdn.pixabay.com/video/2020/12/16/59807-495146039_tiny.mp4' }, 
  { id: 6, type: 'image', url: 'https://images.unsplash.com/photo-1576919228236-a097c32a58be?w=500&q=80' }, 
  { id: 7, type: 'image', url: 'https://images.unsplash.com/photo-1514302240736-b1fee59858eb?w=500&q=80' }, 
];

const calculateMediaPositions = () => {
  const items = [...MEDIA_CONTENT];
  const count = items.length;
  const minY = -3;
  const maxY = 3;
  const yStep = (maxY - minY) / count;

  return items.map((item, index) => {
    const y = minY + index * yStep + (Math.random() - 0.5); 
    const hBase = TREE_HEIGHT / 2;
    const relHeight = (y + hBase) / TREE_HEIGHT;
    const r = (TREE_RADIUS * (1 - relHeight)) + 0.5; 

    const theta = index * 2.4; 
    const x = r * Math.cos(theta);
    const z = r * Math.sin(theta);
    
    return { ...item, position: new THREE.Vector3(x, y, z) };
  });
};

const VideoPlane: React.FC<{ url: string; active: boolean; opacity?: number }> = ({ url, active, opacity = 1 }) => {
  const texture = useVideoTexture(url, { muted: true, loop: true, start: true, playsInline: true });
  useEffect(() => {
    if (active) texture.image.play().catch(() => {});
    else texture.image.pause();
  }, [active, texture]);

  return (
    <mesh>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} toneMapped={false} transparent opacity={opacity} />
    </mesh>
  );
};

const MediaGallery: React.FC<{ shape: ShapeType }> = ({ shape }) => {
  const [activeItem, setActiveItem] = useState<MediaItem | null>(null);
  const itemsWithPos = useMemo(() => calculateMediaPositions(), []);
  
  const groupRef = useRef<THREE.Group>(null);
  const opacityRef = useRef(0);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const targetOpacity = shape === ShapeType.TREE ? 1 : 0;
    opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, targetOpacity, delta * 3);
    groupRef.current.visible = opacityRef.current > 0.01;
  });

  const handleItemClick = (e: any, item: MediaItem) => {
    e.stopPropagation();
    if (shape !== ShapeType.TREE) return;
    setActiveItem(item);
  };

  const closeExpanded = (e: any) => {
    e.stopPropagation();
    setActiveItem(null);
  };

  return (
    <>
      <group ref={groupRef}>
        {itemsWithPos.map((item) => (
          <Billboard
            key={item.id}
            position={item.position}
            follow={true}
            lockX={false}
            lockY={false}
            lockZ={false}
          >
             <group scale={0.8}>
                {item.type === 'image' ? (
                  <Image url={item.url} transparent opacity={0.9} scale={[1.5, 1.5]} toneMapped={false} />
                ) : (
                  <mesh>
                    <planeGeometry args={[1.5, 1.5]} />
                    <meshBasicMaterial color="#ffcc00" opacity={0.8} transparent />
                    <mesh position={[0,0,0.01]}>
                        <circleGeometry args={[0.3, 3]} />
                        <meshBasicMaterial color="black" />
                    </mesh>
                  </mesh>
                )}
                <mesh position={[0, 0, -0.01]}>
                    <planeGeometry args={[1.7, 1.7]} />
                    <meshBasicMaterial color="#fff" opacity={0.6} transparent />
                </mesh>
             </group>
             <mesh visible={false} onClick={(e) => handleItemClick(e, item)}>
                <planeGeometry args={[2.5, 2.5]} />
                <meshBasicMaterial color="red" />
             </mesh>
          </Billboard>
        ))}
      </group>

      {activeItem && (
        <group>
            <mesh position={[0, 0, 20]} onClick={closeExpanded}>
                <planeGeometry args={[100, 100]} />
                <meshBasicMaterial color="black" transparent opacity={0.8} />
            </mesh>
            
            <Billboard position={[0, 0, 25]} follow={true}>
                 <group scale={8}>
                    {activeItem.type === 'image' ? (
                        <Image url={activeItem.url} scale={[1.6, 1]} toneMapped={false} />
                    ) : (
                        <group scale={[1.6, 1, 1]}>
                             <Suspense fallback={<meshBasicMaterial color="gray" />}>
                                <VideoPlane url={activeItem.url} active={true} />
                             </Suspense>
                        </group>
                    )}
                    <mesh position={[0, -0.7, 0]}>
                       <planeGeometry args={[1, 0.1]} />
                       <meshBasicMaterial color="black" transparent opacity={0} />
                    </mesh>
                 </group>
            </Billboard>
        </group>
      )}
    </>
  );
};

export const ParticleScene: React.FC<ParticleSceneProps> = ({ shape }) => {
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

      let gx = Math.cos(angle) * radius;
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
      <instancedMesh ref={meshDiamondRef} args={[undefined, undefined, counts[0]]}>
        <octahedronGeometry args={[0.5, 0]} /> 
        <meshStandardMaterial {...materialProps} />
      </instancedMesh>

      <instancedMesh ref={meshShardRef} args={[undefined, undefined, counts[1]]}>
        <tetrahedronGeometry args={[0.4, 0]} /> 
        <meshStandardMaterial {...materialProps} />
      </instancedMesh>

      <instancedMesh ref={meshOrbRef} args={[undefined, undefined, counts[2]]}>
        <icosahedronGeometry args={[0.3, 0]} /> 
        <meshStandardMaterial {...materialProps} flatShading={true} />
      </instancedMesh>

      {/* ADDED: Cube InstancedMesh */}
      <instancedMesh ref={meshCubeRef} args={[undefined, undefined, counts[3]]}>
        <boxGeometry args={[0.35, 0.35, 0.35]} /> 
        <meshStandardMaterial {...materialProps} />
      </instancedMesh>

      {/* ADDED: Sphere InstancedMesh */}
      <instancedMesh ref={meshSphereRef} args={[undefined, undefined, counts[4]]}>
        <sphereGeometry args={[0.25, 12, 12]} /> 
        <meshStandardMaterial {...materialProps} />
      </instancedMesh>

      <instancedMesh ref={meshGlareRef} args={[undefined, undefined, glareAttributes.indices.length]}>
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
      
      <instancedMesh ref={meshHaloRef} args={[undefined, undefined, haloIndices.length]}>
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
         <Suspense fallback={null}>
            <MediaGallery shape={shape} />
         </Suspense>
      </ErrorBoundary>
    </group>
  );
};

export const FloatingParticles: React.FC = () => {
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
    <instancedMesh ref={meshRef} args={[undefined, undefined, DUST_COUNT]}>
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

export const ShootingStars: React.FC = () => {
    const count = 3; // Pool size
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const tempObj = new THREE.Object3D();
    
    // Maintain state for each meteor
    const meteors = useRef(
        new Array(count).fill(0).map(() => ({
            active: false,
            startTime: 0,
            pos: new THREE.Vector3(),
            dir: new THREE.Vector3(),
            speed: 0,
            life: 0,
            spawnTimer: Math.random() * 5 // Initial stagger
        }))
    );

    useFrame((state, delta) => {
        if (!meshRef.current) return;

        const time = state.clock.getElapsedTime();

        meteors.current.forEach((m, i) => {
            if (m.active) {
                const elapsed = time - m.startTime;
                
                // Move
                m.pos.addScaledVector(m.dir, m.speed * delta);
                
                // Look at direction
                tempObj.position.copy(m.pos);
                // Rotate to align plane with direction
                const lookAtPos = m.pos.clone().add(m.dir);
                tempObj.lookAt(lookAtPos);
                
                // Scale trail based on life or just static length
                tempObj.scale.set(1, 1, 1);
                
                tempObj.updateMatrix();
                meshRef.current!.setMatrixAt(i, tempObj.matrix);

                // Die if too old
                if (elapsed > m.life) {
                    m.active = false;
                    // Respawn in 3-5 seconds
                    m.spawnTimer = 3 + Math.random() * 2;
                    // Reset matrix to zero/hide
                    tempObj.scale.set(0,0,0);
                    tempObj.updateMatrix();
                    meshRef.current!.setMatrixAt(i, tempObj.matrix);
                }
            } else {
                m.spawnTimer -= delta;
                if (m.spawnTimer <= 0) {
                    // Spawn!
                    m.active = true;
                    m.startTime = time;
                    m.life = 1.0; // Short burst
                    m.speed = 40 + Math.random() * 20;
                    
                    // Pick a random spot in the upper hemisphere background
                    const r = 60;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(Math.random() * 0.5); // Top 60 degrees
                    
                    m.pos.set(
                        r * Math.sin(phi) * Math.cos(theta),
                        r * Math.cos(phi) + 10,
                        r * Math.sin(phi) * Math.sin(theta) - 20 // Bias towards back
                    );
                    
                    // Direction: Down and slightly sideways
                    m.dir.set(
                         (Math.random() - 0.5) * 1.0, 
                         -1.0 - Math.random(), 
                         (Math.random() - 0.5) * 0.5
                    ).normalize();
                }
            }
        });
        
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <planeGeometry args={[12, 0.2]} />
            {/* @ts-ignore */}
            <meteorMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </instancedMesh>
    );
};

export default ParticleScene;