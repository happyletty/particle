import React, { useMemo, useRef, useState, useEffect, Suspense, ReactNode, Component } from 'react';
import { useFrame, useThree, extend, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { shaderMaterial, useVideoTexture, Hud, PerspectiveCamera, Text, Sparkles, Environment } from '@react-three/drei';
import { ShapeType } from '../types';

interface ParticleSceneProps {
  shape: ShapeType;
  showMediaOnly: boolean;
}

const TOTAL_COUNT = 6200; 
const GALAXY_RADIUS = 18;
const TREE_HEIGHT = 14; 
const TREE_RADIUS = 8;
const STAR_COUNT = 800;
const GARLAND_COUNT = 2500;

// --- RESOURCE CACHE FOR BLOB LOADING (Fixes CORS/Redirects) ---
const blobCache = new Map<string, { status: 'pending' | 'resolved' | 'rejected', data?: string, promise?: Promise<string>, error?: any }>();

function useBlobUrl(url: string) {
  if (blobCache.has(url)) {
    const entry = blobCache.get(url)!;
    if (entry.status === 'resolved') return entry.data!;
    if (entry.status === 'rejected') throw entry.error;
    if (entry.status === 'pending') throw entry.promise;
  }

  const fetchWithFallback = async (originalUrl: string) => {
      const tryUrl = async (u: string) => {
          const res = await fetch(u);
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          return await res.blob();
      };

      try {
          return await tryUrl(originalUrl);
      } catch (err) {
          console.warn(`Failed loading: ${originalUrl}`, err);
          throw err; 
      }
  };

  const promise = fetchWithFallback(url)
    .then((blob) => {
      const objUrl = URL.createObjectURL(blob);
      blobCache.set(url, { status: 'resolved', data: objUrl });
      return objUrl;
    })
    .catch((err) => {
      console.error("Blob Load Final Error:", err);
      blobCache.set(url, { status: 'rejected', error: err });
      throw err;
    });

  blobCache.set(url, { status: 'pending', promise });
  throw promise; 
}

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode;
  onError?: (error: any, info: any) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: any, info: any) {
    if (this.props.onError) {
      this.props.onError(error, info);
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback || null;
    return this.props.children;
  }
}

// --- Shaders ---

// 1. Halo Material
const HaloMaterial = shaderMaterial(
  { uTime: 0, uColor: new THREE.Color(1.0, 0.6, 0.1) },
  `
    varying vec2 vUv;
    varying float vScale;
    uniform float uTime;
    void main() {
      vUv = uv;
      vec4 worldPosition = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vec3 scale = vec3(length(vec3(instanceMatrix[0].x, instanceMatrix[0].y, instanceMatrix[0].z)), length(vec3(instanceMatrix[1].x, instanceMatrix[1].y, instanceMatrix[1].z)), length(vec3(instanceMatrix[2].x, instanceMatrix[2].y, instanceMatrix[2].z)));
      vScale = scale.x;
      vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      float size = vScale * 6.0; 
      float breathe = 1.0 + 0.15 * sin(uTime * 1.0 + worldPosition.x * 10.0 + worldPosition.y * 5.0);
      size *= breathe;
      vec3 pos = worldPosition.xyz + (camRight * position.x + camUp * position.y) * size;
      gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
    }
  `,
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

// 2. Meteor Material
const MeteorMaterial = shaderMaterial(
  { uTime: 0 },
  `
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
  `
    varying vec2 vUv;
    varying vec3 vInstanceColor;
    void main() {
      float alpha = smoothstep(0.0, 1.0, vUv.x);
      float shape = 1.0 - abs(vUv.y - 0.5) * 2.0;
      alpha *= shape;
      if (alpha < 0.01) discard;
      gl_FragColor = vec4(vInstanceColor, alpha);
    }
  `
);

// 3. Physical Glare Material
const PhysicalGlareMaterial = shaderMaterial(
  { uTime: 0, uTex: new THREE.Texture(), uLightPos: new THREE.Vector3(0, 0, 0), uCamPos: new THREE.Vector3(0, 0, 0) },
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
      float specular = pow(NdotH, 15.0); 
      specular += pow(NdotH, 10.0) * 0.15;
      float breathe = sin(uTime * 0.5 + worldPosition.x * 0.5) * 0.05 + 0.85;
      vIntensity = specular * breathe * 1.0; 
      vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      float glareSize = particleScale * (1.0 + vIntensity * 0.5); 
      vec3 offset = (camRight * position.x + camUp * position.y) * glareSize;
      vec3 finalPos = surfacePos + offset;
      finalPos += viewDir * (particleScale * 0.1);
      gl_Position = projectionMatrix * viewMatrix * vec4(finalPos, 1.0);
    }
  `,
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
      gl_FragColor = vec4(finalColor, texColor.a * min(vIntensity, 1.0)); 
    }
  `
);

// 5. Thumbnail Material (For 1:1 Crop + Sparkle)
const ThumbnailMaterial = shaderMaterial(
  { uMap: new THREE.Texture(), uTime: 0, uImageAspect: 1.0, uRandomOffset: 0.0 },
  `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  `
    uniform sampler2D uMap;
    uniform float uTime;
    uniform float uImageAspect;
    uniform float uRandomOffset;
    varying vec2 vUv;

    // Simple star shape SDF
    float sdStar5(in vec2 p, in float r, in float rf) {
        const vec2 k1 = vec2(0.809016994375, -0.587785252292);
        const vec2 k2 = vec2(-k1.x,k1.y);
        p.x = abs(p.x);
        p -= 2.0*max(dot(k1,p),0.0)*k1;
        p -= 2.0*max(dot(k2,p),0.0)*k2;
        p.x = abs(p.x);
        p.y -= r;
        vec2 ba = rf*vec2(-k1.y,k1.x) - vec2(0,1);
        float h = clamp( dot(p,ba)/dot(ba,ba), 0.0, r );
        return length(p-ba*h) * sign(p.y*ba.x-p.x*ba.y);
    }

    void main() {
      // 1. CROP LOGIC (Cover 1:1)
      vec2 uv = vUv;
      if (uImageAspect > 1.0) {
        // Wide image: crop width
        float range = 1.0 / uImageAspect;
        float offset = (1.0 - range) / 2.0;
        uv.x = offset + uv.x * range;
      } else {
        // Tall image: crop height
        float range = uImageAspect;
        float offset = (1.0 - range) / 2.0;
        uv.y = offset + uv.y * range;
      }

      vec4 texColor = texture2D(uMap, uv);

      // 2. SPARKLE LOGIC
      // Randomize position based on offset slightly
      vec2 starPos = vec2(0.8, 0.8) - vec2(sin(uRandomOffset)*0.1, cos(uRandomOffset)*0.1);
      
      // Calculate distance to current pixel
      // Adjust p for aspect ratio of the plane (which is 1:1) so no adjustment needed
      vec2 p = (vUv - starPos) * 2.0; 
      
      // Star size pulse
      float blink = 0.5 + 0.5 * sin(uTime * 4.0 + uRandomOffset * 10.0);
      float starSize = 0.15 * blink * step(0.9, blink); // Only show when bright
      
      // Using a simple cross flare instead of complex SDF for performance/look
      float dist = length(p);
      float glow = 0.05 / dist;
      
      // Sharper rays
      float rays = max(0.0, 1.0 - abs(p.x * p.y * 1000.0));
      
      float starAlpha = (glow + rays) * blink;
      starAlpha = smoothstep(0.1, 1.0, starAlpha);
      
      // Mix star on top
      vec3 starColor = vec3(1.0, 1.0, 0.8);
      vec3 finalColor = mix(texColor.rgb, starColor, clamp(starAlpha, 0.0, 1.0));
      
      gl_FragColor = vec4(finalColor, texColor.a);
    }
  `
);

extend({ PhysicalGlareMaterial, HaloMaterial, MeteorMaterial, ThumbnailMaterial });

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
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5);
    glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);
};

// --- Media Gallery Types & Data ---
type MediaType = 'image' | 'video';

interface MediaItem {
  id: number;
  type: MediaType;
  url: string;
  position?: THREE.Vector3;
}

const getProxiedImageUrl = (filename: string) => {
    return `https://wsrv.nl/?url=github.com/happyletty/particle/releases/download/1.0/${filename}&w=1024&q=95&output=webp`;
};

const getVideoUrl = (filename: string) => {
    return `https://github.com/happyletty/particle/releases/download/1.0/${filename}`;
};

const RAW_MEDIA_CONTENT: MediaItem[] = [
  ...Array.from({ length: 25 }, (_, i) => ({
    id: i + 1,
    type: 'image' as const,
    url: getProxiedImageUrl(`${i + 1}.jpg`)
  })),
  { id: 101, type: 'video' as const, url: getVideoUrl('1.mp4') },
  { id: 102, type: 'video' as const, url: getVideoUrl('2.mp4') },
  { id: 103, type: 'video' as const, url: getVideoUrl('3.mp4') },
];

const calculateMediaPositions = (items: MediaItem[]) => {
  const count = items.length;
  // Adjust range to avoid top tip and very bottom
  const yStart = -(TREE_HEIGHT / 2) + 1.5; 
  const yEnd = (TREE_HEIGHT / 2) - 3.5; 
  const totalY = yEnd - yStart;
  
  // Use Golden Angle (approx 2.3999 radians) for optimal distribution (Phyllotaxis)
  const phi = Math.PI * (3 - Math.sqrt(5)); 

  return items.map((item, i) => {
    // Distribute y uniformly
    const t = i / (count - 1 || 1);
    const y = yStart + t * totalY;
    
    // Calculate max radius at this height (Cone shape)
    const relHeight = (y + (TREE_HEIGHT / 2)) / TREE_HEIGHT;
    const coneMaxRadius = TREE_RADIUS * (1 - relHeight);
    
    // VOLUME DISTRIBUTION:
    // r = R * sqrt(random) ensures uniform distribution on a disk area.
    // We add a small core offset (0.1) so items don't get stuck inside the central trunk
    const randomR = coneMaxRadius * (0.1 + 0.9 * Math.sqrt(Math.random()));

    // Calculate angle using golden angle spiral
    const theta = i * phi; 
    
    const x = randomR * Math.cos(theta);
    const z = randomR * Math.sin(theta);
    
    return { ...item, position: new THREE.Vector3(x, y, z) };
  });
};

const ErrorPlaceholder: React.FC<{ position?: THREE.Vector3, visible: boolean }> = () => {
  return null;
};

const LoadingPlaceholder: React.FC<{ position?: THREE.Vector3, visible: boolean }> = ({ position, visible }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const scaleRef = useRef(0);
    useFrame((state, delta) => {
      if(meshRef.current) {
          meshRef.current.lookAt(state.camera.position);
          meshRef.current.rotation.z += 0.05;
          const targetScale = visible ? 0.5 : 0.0;
          scaleRef.current = THREE.MathUtils.lerp(scaleRef.current, targetScale, delta * 4);
          meshRef.current.scale.setScalar(scaleRef.current);
      }
    });
    return (
      <mesh ref={meshRef} position={position}>
        <ringGeometry args={[0.2, 0.25, 32]} />
        <meshBasicMaterial color="#4fc3f7" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
    );
};

// --- Media Components ---
const HolographicPanel: React.FC<{ 
  texture: THREE.Texture, 
  item: MediaItem, 
  onClick: (e: any, item: MediaItem) => void, 
  visible: boolean,
  isVideo?: boolean,
  aspectRatio: number 
}> = ({ texture, item, onClick, visible, isVideo, aspectRatio }) => {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<any>(null);
  const [hovered, setHover] = useState(false);
  const scaleRef = useRef(0);
  const BASE_SIZE = 0.5;

  const renderHeight = BASE_SIZE;
  const renderWidth = BASE_SIZE; 
  // THICKNESS: Increased Z-depth for the frame
  const FRAME_THICKNESS = 0.15;

  useFrame((state, delta) => {
    if (groupRef.current) {
      // NOTE: This ensures the panel always faces the camera, even while rotating with the tree
      groupRef.current.lookAt(state.camera.position);
      const floatY = Math.sin(state.clock.elapsedTime + item.id) * 0.1; 
      groupRef.current.position.y = (item.position?.y || 0) + floatY;
      
      const targetScale = visible ? (hovered ? 1.5 : 1.0) : 0;
      scaleRef.current = THREE.MathUtils.lerp(scaleRef.current, targetScale, delta * 4);
      groupRef.current.scale.setScalar(scaleRef.current);
    }
    if (materialRef.current) {
        materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
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
      {/* 3D Frame Body */}
      <mesh position={[0, 0, -FRAME_THICKNESS / 2]}>
         <boxGeometry args={[renderWidth * 1.1, renderHeight * 1.1, FRAME_THICKNESS]} />
         <meshStandardMaterial 
            color={hovered ? "#fff5cc" : "#FFD700"} 
            metalness={1.0} 
            roughness={0.2} 
            envMapIntensity={2.0} 
         />
      </mesh>
      {/* Content Plane - Pushed slightly forward to sit on the face of the box */}
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[renderWidth, renderHeight]} />
        {/* @ts-ignore */}
        <thumbnailMaterial 
            ref={materialRef} 
            uMap={texture} 
            uImageAspect={aspectRatio} 
            uRandomOffset={item.id} 
            transparent 
        />
      </mesh>
    </group>
  );
};

const ImageLoader: React.FC<{ item: MediaItem, onClick: any, visible: boolean }> = ({ item, onClick, visible }) => {
    const blobUrl = useBlobUrl(item.url); 
    const texture = useLoader(THREE.TextureLoader, blobUrl);
    const { gl } = useThree();

    useEffect(() => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = gl.capabilities.getMaxAnisotropy();
        texture.minFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
    }, [texture, gl]);
    
    const aspect = (texture.image && texture.image.width && texture.image.height) 
        ? texture.image.width / texture.image.height 
        : 1;

    return <HolographicPanel texture={texture} item={item} onClick={onClick} visible={visible} aspectRatio={aspect} />;
};

const VideoLoader: React.FC<{ item: MediaItem, onClick: any, visible: boolean }> = ({ item, onClick, visible }) => {
    const blobUrl = useBlobUrl(item.url); 
    const texture = useVideoTexture(blobUrl, { 
        muted: true, loop: true, start: true, playsInline: true 
    });

    const video = texture.image;
    const aspect = (video && video.videoWidth && video.videoHeight)
        ? video.videoWidth / video.videoHeight
        : 1.77; 

    return <HolographicPanel texture={texture} item={item} onClick={onClick} visible={visible} isVideo aspectRatio={aspect} />;
};

// --- Preview Components ---
const PreviewImage: React.FC<{ url: string }> = ({ url }) => {
  const blobUrl = useBlobUrl(url);
  const texture = useLoader(THREE.TextureLoader, blobUrl);
  const { gl } = useThree();

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = gl.capabilities.getMaxAnisotropy();
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
  }, [texture, gl]);

  const image = texture.image;
  const aspect = (image && image.width && image.height) ? image.width / image.height : 1.6;
  const height = 4.5; 
  const width = height * aspect;
  const THICKNESS = 0.2;

  return (
    <group>
      {/* Image on front face */}
      <mesh position={[0, 0, THICKNESS / 2 + 0.01]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} transparent color="white" />
      </mesh>
      {/* Thick Metallic Gold Block Behind */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[width + 0.3, height + 0.3, THICKNESS]} />
        <meshStandardMaterial 
          color="#FFD700" 
          metalness={1.0} 
          roughness={0.1} 
          envMapIntensity={2.0} 
        />
      </mesh>
    </group>
  );
};

const PreviewVideoPlane: React.FC<{ url: string }> = ({ url }) => {
  const blobUrl = useBlobUrl(url);
  const texture = useVideoTexture(blobUrl, { muted: false, loop: true, start: true, playsInline: true });
  
  useEffect(() => {
    const video = texture.image;
    if(video) { video.muted = false; video.volume = 1.0; video.play().catch(console.error); }
  }, [texture]);

  const video = texture.image;
  const aspect = (video && video.videoWidth && video.videoHeight)
      ? video.videoWidth / video.videoHeight
      : 1.77;
  
  const height = 4.5;
  const width = height * aspect;
  const THICKNESS = 0.2;

  return (
    <group>
      <mesh position={[0, 0, THICKNESS / 2 + 0.01]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} color="white" />
      </mesh>
      {/* Thick Metallic Gold Block Behind */}
      <mesh position={[0, 0, 0]}>
         <boxGeometry args={[width + 0.3, height + 0.3, THICKNESS]} />
         <meshStandardMaterial 
            color="#FFD700" 
            metalness={1.0} 
            roughness={0.1} 
            envMapIntensity={2.0} 
         />
      </mesh>
    </group>
  );
};

function easeOutBack(x: number): number {
    const c1 = 0.6; 
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

const AnimatedPreview: React.FC<{
    item: MediaItem;
    startPos: THREE.Vector3;
    isClosing: boolean;
    onCloseComplete: () => void;
}> = ({ item, startPos, isClosing, onCloseComplete }) => {
    const groupRef = useRef<THREE.Group>(null);
    const { gl } = useThree();
    const [targetZoom, setTargetZoom] = useState(1);
    const progress = useRef(0);
    
    useEffect(() => {
        if (!isClosing) { progress.current = 0; setTargetZoom(1); }
    }, [isClosing, item]);

    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            e.preventDefault(); e.stopPropagation();
            const sensitivity = 0.0015;
            setTargetZoom(prev => Math.max(0.2, Math.min(prev - (e.deltaY * sensitivity), 5.0)));
        };
        gl.domElement.addEventListener('wheel', handleWheel, { passive: false, capture: true });
        return () => gl.domElement.removeEventListener('wheel', handleWheel, { capture: true });
    }, [gl.domElement]);

    useFrame((state, delta) => {
        if (!groupRef.current) return;
        const speed = delta * 1.2;

        if (isClosing) {
            progress.current -= speed;
            if (progress.current <= 0) { progress.current = 0; onCloseComplete(); }
        } else {
            progress.current += speed;
            if (progress.current >= 1) progress.current = 1;
        }

        const t = progress.current;
        const easedScale = isClosing ? t : easeOutBack(t); 
        const posT = 1 - Math.pow(1 - t, 3);
        groupRef.current.position.lerpVectors(startPos, new THREE.Vector3(0, 0, 0), posT);
        
        const s = easedScale * targetZoom;
        groupRef.current.scale.setScalar(Math.max(0.001, s));
    });

    return (
        <group ref={groupRef} position={startPos} scale={0}>
             {item.type === 'image' ? (
                 <Suspense fallback={null}>
                    <PreviewImage url={item.url} />
                 </Suspense>
             ) : (
                <Suspense fallback={null}>
                   <PreviewVideoPlane url={item.url} />
                </Suspense>
             )}
        </group>
    );
};

// --- Animated Text Component ---
const AnimatedLetter: React.FC<{ char: string, index: number, total: number, visible: boolean, fontUrl: string }> = ({ char, index, total, visible, fontUrl }) => {
    const matRef = useRef<THREE.MeshStandardMaterial>(null);
    const [pos] = useState<[number, number, number]>(() => [(index - total / 2) * 1.5, 0, 0]);
    
    useFrame((state) => {
        if (!matRef.current) return;
        const time = state.clock.getElapsedTime();
        let targetOp = 0;
        
        if (visible) {
             // Random flicker logic
             // Base visibility
             const base = 0.85; 
             // Random noise per letter
             const noise = Math.sin(time * 8 + index * 123.45);
             // Occasional dip in brightness (flicker)
             const flicker = noise > 0.6 ? 1.0 : (noise < -0.85 ? 0.3 : 0.9);
             targetOp = base * flicker;
        }
        
        // Smooth transition
        matRef.current.opacity = THREE.MathUtils.lerp(matRef.current.opacity, targetOp, 0.05);
    });

    return (
        <Text
            font={fontUrl}
            fontSize={3}
            position={pos}
            anchorX="center"
            anchorY="middle"
        >
            {char}
            <meshStandardMaterial
                ref={matRef}
                color="#FFD700"
                emissive="#FFD700"
                emissiveIntensity={1.5}
                toneMapped={false}
                metalness={1.0}
                roughness={0.15}
                transparent
                depthWrite={false}
                opacity={0}
            />
        </Text>
    );
};

const MerryChristmasText: React.FC<{ visible: boolean }> = ({ visible }) => {
    const groupRef = useRef<THREE.Group>(null);
    const fontUrl = 'https://fonts.gstatic.com/s/greatvibes/v14/RWmMoKWR9v4ksMflq1LHgjczP5v5.woff';
    const text = "Merry Christmas";
    const letters = text.split('');

    useFrame((state) => {
        if (!groupRef.current) return;
        // Slow floating motion
        const time = state.clock.getElapsedTime();
        // Position fixed at Z=14 to be clearly in front of the tree (radius 8-10)
        groupRef.current.position.y = 4 + Math.sin(time * 0.5) * 0.5;
    });

    return (
        <group ref={groupRef} position={[0, 4, 14]}>
            <Suspense fallback={null}>
                {letters.map((char, i) => (
                    <AnimatedLetter 
                        key={i} 
                        char={char} 
                        index={i} 
                        total={letters.length} 
                        visible={visible} 
                        fontUrl={fontUrl} 
                    />
                ))}
            </Suspense>
            {visible && (
                <Sparkles 
                    count={40}
                    scale={[25, 5, 5]}
                    size={4}
                    speed={0.4}
                    opacity={0.8}
                    color="#FFD700"
                    noise={1}
                />
            )}
        </group>
    );
};

const MediaGallery: React.FC<{ shape: ShapeType, showMediaOnly: boolean }> = ({ shape, showMediaOnly }) => {
  const [activeItem, setActiveItem] = useState<MediaItem | null>(null);
  const [startPos, setStartPos] = useState<THREE.Vector3>(new THREE.Vector3());
  const [isClosing, setIsClosing] = useState(false);

  const itemsWithPos = useMemo(() => {
    const shuffled = [...RAW_MEDIA_CONTENT].sort(() => Math.random() - 0.5);
    return calculateMediaPositions(shuffled);
  }, []);
  
  const { camera, size } = useThree();
  const isTree = shape === ShapeType.TREE;
  const areItemsVisible = isTree || showMediaOnly;

  const handleItemClick = (e: any, item: MediaItem) => {
    if (!areItemsVisible) return;
    const worldPos = item.position!.clone();
    const clickedObject = e.object; 
    const targetVec = new THREE.Vector3();
    clickedObject.getWorldPosition(targetVec);
    targetVec.project(camera);
    const hudCamZ = 10;
    const vFov = 50; 
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(vFov) / 2) * hudCamZ;
    const visibleWidth = visibleHeight * (size.width / size.height);
    const hudX = (targetVec.x * visibleWidth) / 2;
    const hudY = (targetVec.y * visibleHeight) / 2;
    setStartPos(new THREE.Vector3(hudX, hudY, 0));
    setActiveItem(item);
    setIsClosing(false);
  };

  const triggerClose = (e: any) => { e.stopPropagation(); setIsClosing(true); };
  const handleCloseComplete = () => { setActiveItem(null); setIsClosing(false); };

  return (
    <>
      <group>
        {itemsWithPos.map((item) => (
           <ErrorBoundary 
              key={item.id} 
              fallback={<ErrorPlaceholder position={item.position} visible={areItemsVisible} />}
              onError={(err) => console.warn(`Media item ${item.url} failed.`, err)}
           >
             <Suspense fallback={<LoadingPlaceholder position={item.position} visible={areItemsVisible} />}>
               {item.type === 'video' ? (
                  <VideoLoader item={item} onClick={handleItemClick} visible={areItemsVisible && activeItem?.id !== item.id} />
               ) : (
                  <ImageLoader item={item} onClick={handleItemClick} visible={areItemsVisible && activeItem?.id !== item.id} />
               )}
             </Suspense>
           </ErrorBoundary>
        ))}
      </group>

      {activeItem && (
        <Hud renderPriority={1}>
           <PerspectiveCamera makeDefault position={[0, 0, 10]} fov={50} />
           <ambientLight intensity={1} /> 
           <pointLight position={[5, 5, 5]} intensity={2} />
           <Environment preset="city" /> 
           <mesh onClick={triggerClose} position={[0, 0, -2]}>
              <planeGeometry args={[100, 100]} />
              <meshBasicMaterial color="black" transparent opacity={0.0} depthTest={false} />
           </mesh>
           <ErrorBoundary fallback={<Text position={[0,0,0]} color="red">Failed to load preview</Text>}>
               <AnimatedPreview item={activeItem} startPos={startPos} isClosing={isClosing} onCloseComplete={handleCloseComplete} />
           </ErrorBoundary>
        </Hud>
      )}
    </>
  );
};

export const ParticleScene: React.FC<ParticleSceneProps> = ({ shape, showMediaOnly }) => {
  const meshDiamondRef = useRef<THREE.InstancedMesh>(null); 
  const meshShardRef = useRef<THREE.InstancedMesh>(null);   
  const meshOrbRef = useRef<THREE.InstancedMesh>(null);
  const meshCubeRef = useRef<THREE.InstancedMesh>(null);
  const meshSphereRef = useRef<THREE.InstancedMesh>(null);
  const meshGlareRef = useRef<THREE.InstancedMesh>(null);
  const meshHaloRef = useRef<THREE.InstancedMesh>(null);
  const mediaGroupRef = useRef<THREE.Group>(null);
  
  const glareMatRef = useRef<THREE.ShaderMaterial>(null);
  const haloMatRef = useRef<THREE.ShaderMaterial>(null);
  const haloScaleFactor = useRef(0);

  const starTexture = useDiffractionTexture();
  const { camera } = useThree();
  const tempObject = new THREE.Object3D();
  const lightPos = new THREE.Vector3(-25, 30, 20);

  const { particles, counts, glareAttributes, haloIndices } = useMemo(() => {
    const data = [];
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
      const shapeType = Math.floor(Math.random() * 5);
      typeCounts[shapeType]++;
      // OPTIMIZATION: Drastically reduce glare count.
      if (Math.random() < 0.1) {
          gIndices.push(i);
          const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
          gNormals.push(v.x, v.y, v.z);
      }
      
      const t = Math.random();
      const radius = Math.pow(t, 1.2) * GALAXY_RADIUS; 
      const distRatio = radius / GALAXY_RADIUS;
      const branchAngle = (i % branches) * ((2 * Math.PI) / branches);
      const curveAngle = radius * 0.3 * spin;
      const randomSpread = (Math.random() - 0.5) * (0.5 + radius * 0.05); 
      const angle = branchAngle + curveAngle + randomSpread;
      let gx = Math.cos(angle) * radius * 1.2;
      let gz = Math.sin(angle) * radius;
      let gy = (Math.random() - 0.5) * (2 + (GALAXY_RADIUS - radius) * 0.2) * 1.5;
      let tx, ty, tz;
      let tColor = new THREE.Color();
      let specificScaleMultiplier = 1.0;

      if (i < STAR_COUNT) {
         if (i === 0) {
             tx = 0; ty = (TREE_HEIGHT / 2) + 0.8; tz = 0;
             tColor.set('#ffffff'); specificScaleMultiplier = 5.0; hIndices.push(i); 
             gx = 0; gy = 0; gz = 0;
         } else {
             const rOuter = 0.9; const rInner = 0.25; 
             const angle = Math.random() * Math.PI * 2;
             const angleShifted = angle - Math.PI / 2;
             const numSpikes = 5;
             let normTheta = angleShifted % (Math.PI * 2);
             if (normTheta < 0) normTheta += Math.PI * 2;
             const segmentStep = Math.PI / numSpikes; 
             const segmentIdx = Math.floor(normTheta / segmentStep);
             const t = (normTheta % segmentStep) / segmentStep;
             let maxR = 0;
             if (segmentIdx % 2 === 0) maxR = rOuter * (1 - t) + rInner * t;
             else maxR = rInner * (1 - t) + rOuter * t;
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
             if (Math.random() < 0.04) { isHalo = true; lastHaloIndex = i; }
         }
         if (isHalo) { tColor.copy(colorHighlight); specificScaleMultiplier = 1.0; hIndices.push(i); } 
         else {
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
          tx = r * Math.cos(theta); tz = r * Math.sin(theta); ty = h - (TREE_HEIGHT / 2);
          const isOrnament = Math.random() > 0.95;
          if (isOrnament) {
              const ornType = Math.random();
              if (ornType > 0.6) tColor.copy(colorRed);
              else if (ornType > 0.3) tColor.copy(colorGarlandGold);
              else tColor.copy(cWhite);
          } else { tColor.copy(colorTree).lerp(new THREE.Color('#059669'), Math.random()); }
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
      const rotationSpeed = { x: (Math.random() - 0.5) * 0.03, y: (Math.random() - 0.5) * 0.03, z: (Math.random() - 0.5) * 0.03 };
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
    return { particles: data, counts: typeCounts, glareAttributes: { indices: gIndices, normals: new Float32Array(gNormals) }, haloIndices: hIndices };
  }, []);

  useFrame((state, delta) => {
    if (!meshDiamondRef.current) return;
    if (glareMatRef.current) {
        glareMatRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
        glareMatRef.current.uniforms.uCamPos.value.copy(camera.position);
        glareMatRef.current.uniforms.uLightPos.value.copy(lightPos);
    }
    if (haloMatRef.current) haloMatRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
    const lerpFactor = THREE.MathUtils.clamp(delta * 2.0, 0, 1);
    const targetHaloScale = shape === ShapeType.TREE ? 1.0 : 0.0;
    haloScaleFactor.current = THREE.MathUtils.lerp(haloScaleFactor.current, targetHaloScale, delta * 3.0);
    const rotSpeed = delta * 0.04;
    const newRotY = meshDiamondRef.current.rotation.y + rotSpeed;
    meshDiamondRef.current.rotation.y = newRotY;
    meshShardRef.current!.rotation.y = newRotY;
    meshOrbRef.current!.rotation.y = newRotY;
    meshCubeRef.current!.rotation.y = newRotY;
    meshSphereRef.current!.rotation.y = newRotY;
    if (meshGlareRef.current) meshGlareRef.current.rotation.y = newRotY;
    if (meshHaloRef.current) meshHaloRef.current.rotation.y = newRotY;
    
    // SYNC MEDIA ROTATION WITH PARTICLES
    if (mediaGroupRef.current) {
        mediaGroupRef.current.rotation.y = newRotY;
    }

    let idx0 = 0, idx1 = 0, idx2 = 0, idx3 = 0, idx4 = 0;
    particles.forEach((particle, i) => {
      const target = shape === ShapeType.TREE ? particle.targetPos.tree : particle.targetPos.galaxy;
      particle.currentPos.lerp(target, lerpFactor);
      const targetCol = shape === ShapeType.TREE ? particle.targetColor.tree : particle.targetColor.galaxy;
      particle.currentColor.lerp(targetCol, lerpFactor);
      particle.rotation.x += particle.rotationSpeed.x;
      particle.rotation.y += particle.rotationSpeed.y;
      tempObject.position.copy(particle.currentPos);
      tempObject.rotation.copy(particle.rotation);
      const geomScale = (i === 0) ? 0 : particle.scale;
      tempObject.scale.setScalar(geomScale);
      tempObject.updateMatrix();
      if (particle.shapeType === 0) { meshDiamondRef.current!.setMatrixAt(idx0, tempObject.matrix); meshDiamondRef.current!.setColorAt(idx0, particle.currentColor); idx0++; }
      else if (particle.shapeType === 1) { meshShardRef.current!.setMatrixAt(idx1, tempObject.matrix); meshShardRef.current!.setColorAt(idx1, particle.currentColor); idx1++; }
      else if (particle.shapeType === 2) { meshOrbRef.current!.setMatrixAt(idx2, tempObject.matrix); meshOrbRef.current!.setColorAt(idx2, particle.currentColor); idx2++; } 
      else if (particle.shapeType === 3) { meshCubeRef.current!.setMatrixAt(idx3, tempObject.matrix); meshCubeRef.current!.setColorAt(idx3, particle.currentColor); idx3++; } 
      else { meshSphereRef.current!.setMatrixAt(idx4, tempObject.matrix); meshSphereRef.current!.setColorAt(idx4, particle.currentColor); idx4++; }
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
    meshDiamondRef.current.instanceMatrix.needsUpdate = true; if(meshDiamondRef.current.instanceColor) meshDiamondRef.current.instanceColor.needsUpdate = true;
    meshShardRef.current!.instanceMatrix.needsUpdate = true; if(meshShardRef.current!.instanceColor) meshShardRef.current!.instanceColor.needsUpdate = true;
    meshOrbRef.current!.instanceMatrix.needsUpdate = true; if(meshOrbRef.current!.instanceColor) meshOrbRef.current!.instanceColor.needsUpdate = true;
    meshCubeRef.current!.instanceMatrix.needsUpdate = true; if(meshCubeRef.current!.instanceColor) meshCubeRef.current!.instanceColor.needsUpdate = true;
    meshSphereRef.current!.instanceMatrix.needsUpdate = true; if(meshSphereRef.current!.instanceColor) meshSphereRef.current!.instanceColor.needsUpdate = true;
  });

  const materialProps = { roughness: 0.1, metalness: 0.9, flatShading: true, emissive: new THREE.Color("#000000"), envMapIntensity: 1.5 };

  return (
    <group>
      <instancedMesh ref={meshDiamondRef} args={[undefined, undefined, counts[0]]} visible={!showMediaOnly}><octahedronGeometry args={[0.5, 0]} /><meshStandardMaterial {...materialProps} /></instancedMesh>
      <instancedMesh ref={meshShardRef} args={[undefined, undefined, counts[1]]} visible={!showMediaOnly}><tetrahedronGeometry args={[0.4, 0]} /><meshStandardMaterial {...materialProps} /></instancedMesh>
      <instancedMesh ref={meshOrbRef} args={[undefined, undefined, counts[2]]} visible={!showMediaOnly}><icosahedronGeometry args={[0.3, 0]} /><meshStandardMaterial {...materialProps} flatShading={true} /></instancedMesh>
      <instancedMesh ref={meshCubeRef} args={[undefined, undefined, counts[3]]} visible={!showMediaOnly}><boxGeometry args={[0.35, 0.35, 0.35]} /><meshStandardMaterial {...materialProps} /></instancedMesh>
      <instancedMesh ref={meshSphereRef} args={[undefined, undefined, counts[4]]} visible={!showMediaOnly}><sphereGeometry args={[0.25, 12, 12]} /><meshStandardMaterial {...materialProps} /></instancedMesh>

      <instancedMesh ref={meshGlareRef} args={[undefined, undefined, glareAttributes.indices.length]} visible={!showMediaOnly}>
        <planeGeometry args={[1, 1]}><instancedBufferAttribute attach="attributes-aRandomNormal" args={[glareAttributes.normals, 3]} /></planeGeometry>
        {/* @ts-ignore */}
        <physicalGlareMaterial ref={glareMatRef} transparent={true} depthWrite={false} blending={THREE.AdditiveBlending} uTex={starTexture} />
      </instancedMesh>
      <instancedMesh ref={meshHaloRef} args={[undefined, undefined, haloIndices.length]} visible={!showMediaOnly}>
        <planeGeometry args={[1, 1]} />
        {/* @ts-ignore */}
        <haloMaterial ref={haloMatRef} transparent={true} depthWrite={false} blending={THREE.AdditiveBlending} />
      </instancedMesh>

      {/* Rotating Group for Media */}
      <group ref={mediaGroupRef}>
          <ErrorBoundary fallback={null}>
            <MediaGallery shape={shape} showMediaOnly={showMediaOnly} />
          </ErrorBoundary>
      </group>

      {/* Merry Christmas Text (Does not rotate with scene) */}
      <ErrorBoundary fallback={null}>
         <MerryChristmasText visible={shape === ShapeType.TREE && !showMediaOnly} />
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
      const r = Math.sqrt(Math.random()) * 80; const theta = Math.random() * Math.PI * 2; const ySpread = (Math.random() - 0.5) * 40; 
      const x = r * Math.cos(theta); const z = r * Math.sin(theta); const y = ySpread; const speed = (Math.random() * 0.01) + 0.005; 
      const color = new THREE.Color('#e0e0e0').lerp(new THREE.Color('#ffffff'), Math.random());
      data.push({ initialPos: new THREE.Vector3(x, y, z), radius: Math.sqrt(x*x + z*z), angle: theta, y: y, speed, scale: Math.random() * 0.2 + 0.05, color, rotationSpeed: { x: (Math.random() - 0.5) * 0.002, y: (Math.random() - 0.5) * 0.002 } });
    }
    return data;
  }, []);
  useFrame((state, delta) => {
    if (!meshRef.current) return;
    dustData.forEach((d, i) => {
      d.angle += d.speed * delta * 0.25; 
      const nx = Math.cos(d.angle) * d.radius; const nz = Math.sin(d.angle) * d.radius; const time = state.clock.getElapsedTime();
      const ny = d.y + Math.sin(time * 0.25 + d.radius) * 2;
      tempObject.position.set(nx, ny, nz); tempObject.rotation.x += d.rotationSpeed.x; tempObject.rotation.y += d.rotationSpeed.y; tempObject.scale.setScalar(d.scale); tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix); meshRef.current!.setColorAt(i, d.color);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, DUST_COUNT]} visible={visible}>
      <octahedronGeometry args={[0.5, 0]} /><meshStandardMaterial roughness={0.0} metalness={1.0} flatShading={true} emissive="#ffffff" emissiveIntensity={0.15} envMapIntensity={2.0} />
    </instancedMesh>
  );
};

export const ShootingStars: React.FC<{ visible?: boolean }> = ({ visible = true }) => {
    const count = 6; const meshRef = useRef<THREE.InstancedMesh>(null); const tempObj = new THREE.Object3D();
    const controller = useRef({ nextSpawnTime: 0, burstRemaining: 0 });
    const meteors = useRef(new Array(count).fill(0).map(() => ({ active: false, startTime: 0, pos: new THREE.Vector3(), dir: new THREE.Vector3(), speed: 0, life: 0, scale: 0, fadeDuration: 0 })));
    useEffect(() => { controller.current.nextSpawnTime = 2.0; if (meshRef.current) { const white = new THREE.Color(1, 1, 1); for (let i = 0; i < count; i++) { meshRef.current.setColorAt(i, white); } if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true; } }, []);
    useFrame((state, delta) => {
        if (!meshRef.current) return;
        const camera = state.camera; const time = state.clock.getElapsedTime();
        // Spawns much less frequently (5.0s base + random)
        if (time > controller.current.nextSpawnTime) {
            if (controller.current.burstRemaining === 0) controller.current.burstRemaining = 1 + Math.floor(Math.random() * 2);
            const availableMeteor = meteors.current.find(m => !m.active);
            if (availableMeteor) {
                const fadeDuration = (Math.random() * 1.5) * 0.5; const life = 0.4 + Math.random() * 0.2 + fadeDuration; 
                availableMeteor.active = true; availableMeteor.startTime = time; availableMeteor.life = life; availableMeteor.fadeDuration = fadeDuration; availableMeteor.speed = 50 + Math.random() * 10; availableMeteor.scale = 2.5; 
                const matrix = camera.matrixWorld; const right = new THREE.Vector3().setFromMatrixColumn(matrix, 0).normalize(); const up = new THREE.Vector3().setFromMatrixColumn(matrix, 1).normalize(); const backward = new THREE.Vector3().setFromMatrixColumn(matrix, 2).normalize(); const forward = backward.clone().negate();
                const bgDist = 200 + Math.random() * 50; const spawnPlaneCenter = forward.clone().multiplyScalar(bgDist);
                const isLeftToRight = Math.random() > 0.5; const xOffset = 50 + (bgDist - 60) * 0.5; const startX = isLeftToRight ? -xOffset : xOffset; const startY = 10 + Math.random() * 20; 
                const pos = new THREE.Vector3().copy(spawnPlaneCenter).add(right.clone().multiplyScalar(startX)).add(up.clone().multiplyScalar(startY));
                const angleDeg = 10 + Math.random() * 20; const angleRad = THREE.MathUtils.degToRad(angleDeg);
                const dx = Math.cos(angleRad) * (isLeftToRight ? 1 : -1); const dy = -Math.sin(angleRad);
                const dir = new THREE.Vector3().add(right.clone().multiplyScalar(dx)).add(up.clone().multiplyScalar(dy)).normalize();
                availableMeteor.pos.copy(pos); availableMeteor.dir.copy(dir);
                meshRef.current.setColorAt(meteors.current.indexOf(availableMeteor), new THREE.Color(1,1,1));
                controller.current.burstRemaining--;
                if (controller.current.burstRemaining > 0) controller.current.nextSpawnTime = time + 0.1 + Math.random() * 0.4;
                else { const interval = 5.0 + Math.random() * 4.0; controller.current.nextSpawnTime = time + life + interval; }
            } else controller.current.nextSpawnTime = time + 0.1;
        }
        meteors.current.forEach((m, i) => {
            if (m.active) {
                const elapsed = time - m.startTime;
                m.pos.addScaledVector(m.dir, m.speed * delta);
                const xDir = m.dir.clone(); const zDir = new THREE.Vector3().subVectors(camera.position, m.pos).normalize(); const yDir = new THREE.Vector3().crossVectors(zDir, xDir).normalize(); const finalZ = new THREE.Vector3().crossVectors(xDir, yDir).normalize();
                const rotMatrix = new THREE.Matrix4().makeBasis(xDir, yDir, finalZ); rotMatrix.setPosition(m.pos);
                const timeRemaining = m.life - elapsed; let brightness = 1.0;
                if (timeRemaining < m.fadeDuration && m.fadeDuration > 0) brightness = timeRemaining / m.fadeDuration;
                brightness = THREE.MathUtils.clamp(brightness, 0, 1);
                const c = new THREE.Color(brightness, brightness, brightness); meshRef.current!.setColorAt(i, c);
                const s = m.scale; const scaleMatrix = new THREE.Matrix4().makeScale(s, s, s);
                tempObj.matrix.multiplyMatrices(rotMatrix, scaleMatrix);
                meshRef.current!.setMatrixAt(i, tempObj.matrix);
                if (elapsed > m.life) { m.active = false; tempObj.matrix.identity().scale(new THREE.Vector3(0,0,0)); meshRef.current!.setMatrixAt(i, tempObj.matrix); }
            } else { tempObj.matrix.identity().scale(new THREE.Vector3(0,0,0)); meshRef.current!.setMatrixAt(i, tempObj.matrix); }
        });
        meshRef.current.instanceMatrix.needsUpdate = true; if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    });
    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]} visible={visible}>
            <planeGeometry args={[16, 0.4]} />
            {/* @ts-ignore */}
            <meteorMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </instancedMesh>
    );
};

export default ParticleScene;