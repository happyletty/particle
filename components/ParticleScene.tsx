import React, { useMemo, useRef } from 'react';
import { useFrame, useThree, extend } from '@react-three/fiber';
import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
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
// Significantly increased star count for density
const STAR_COUNT = 800;
const GARLAND_COUNT = 2500;

// --- 0. Soft Halo Material for Yellow Blobs ---
const HaloMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color(1.0, 0.6, 0.1), // Warm Orange-Yellow
  },
  // Vertex Shader
  `
    varying vec2 vUv;
    varying float vScale;
    uniform float uTime;

    void main() {
      vUv = uv;
      vec4 worldPosition = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      
      // Extract scale from instance matrix
      vec3 scale = vec3(
        length(vec3(instanceMatrix[0].x, instanceMatrix[0].y, instanceMatrix[0].z)),
        length(vec3(instanceMatrix[1].x, instanceMatrix[1].y, instanceMatrix[1].z)),
        length(vec3(instanceMatrix[2].x, instanceMatrix[2].y, instanceMatrix[2].z))
      );
      vScale = scale.x;

      // Billboard logic
      vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      
      // Make halo larger relative to the particle size
      float size = vScale * 6.0; 
      
      // Add subtle breathing to the halo
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
      // Soft circular glow
      float alpha = smoothstep(0.5, 0.0, d);
      alpha = pow(alpha, 3.0); // Increase falloff for a "bulb" look
      
      if (alpha < 0.01) discard;
      
      // Brighter core
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
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }
  `,
  // Fragment
  `
    varying vec2 vUv;
    uniform vec3 uColor;
    void main() {
      // Gradient fade from head (right) to tail (left)
      float alpha = smoothstep(0.0, 1.0, vUv.x);
      // Make it thinner at the tail
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
    
    // Use 'screen' blending for light accumulation simulation
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

    // 1. Compact, intense Core
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.04);
    glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
    glow.addColorStop(0.5, 'rgba(255, 240, 220, 0.4)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.04, 0, Math.PI * 2);
    ctx.fill();

    // 2. Sharp Aperture Spikes
    drawSpike(size * 0.4, 2.0, 0, coreWhite, warmGlow);
    drawSpike(size * 0.4, 2.0, 90, coreWhite, warmGlow);
    drawSpike(size * 0.4, 2.0, 180, coreWhite, warmGlow);
    drawSpike(size * 0.4, 2.0, 270, coreWhite, warmGlow);

    // 3. Faint Diagonals (Anamorphic hint)
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
      
      // 1. Calculate World Position of the Particle Center
      vec4 worldPosition = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      
      // 2. Reconstruct World Normal of the "Reflective Facet"
      mat3 worldRotation = mat3(modelMatrix) * mat3(instanceMatrix);
      vec3 worldNormal = normalize(worldRotation * aRandomNormal);

      // 3. Calculate Scale
      float particleScale = length(worldRotation[0]);

      // 4. Offset to Surface
      vec3 surfacePos = worldPosition.xyz + (worldNormal * particleScale * 0.5);

      // 5. Lighting Physics (Blinn-Phong)
      vec3 viewDir = normalize(uCamPos - surfacePos);
      vec3 lightDir = normalize(uLightPos - surfacePos);
      vec3 halfVector = normalize(viewDir + lightDir); 

      float NdotH = max(0.0, dot(worldNormal, halfVector));
      
      float specular = pow(NdotH, 60.0); 
      specular += pow(NdotH, 20.0) * 0.15;

      // REVERTED: Back to smooth breathing sine wave (removed high-freq jitter)
      float breathe = sin(uTime * 3.0 + worldPosition.x * 0.5) * 0.3 + 0.7;
      vIntensity = specular * breathe * 4.0;

      // 6. Billboard Logic
      vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

      float glareSize = particleScale * (2.0 + vIntensity * 1.5); 
      
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

export const ParticleScene: React.FC<ParticleSceneProps> = ({ shape }) => {
  const meshDiamondRef = useRef<THREE.InstancedMesh>(null); 
  const meshShardRef = useRef<THREE.InstancedMesh>(null);   
  const meshOrbRef = useRef<THREE.InstancedMesh>(null);
  const meshGlareRef = useRef<THREE.InstancedMesh>(null);
  const meshHaloRef = useRef<THREE.InstancedMesh>(null);
  
  const glareMatRef = useRef<THREE.ShaderMaterial>(null);
  const haloMatRef = useRef<THREE.ShaderMaterial>(null);
  
  // Controls visibility of halos based on shape (1 = full tree, 0 = no halo in galaxy)
  const haloScaleFactor = useRef(0);

  const starTexture = useDiffractionTexture();
  const { camera } = useThree();
  const tempObject = new THREE.Object3D();
  
  const lightPos = new THREE.Vector3(-25, 30, 20);

  const { particles, counts, glareAttributes, haloIndices } = useMemo(() => {
    const data = [];
    const typeCounts = [0, 0, 0];
    
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

    // Track last halo position to prevent clumping
    let lastHaloIndex = -100;
    const MIN_HALO_GAP = 15; // Minimum particles between halos

    for (let i = 0; i < TOTAL_COUNT; i++) {
      const shapeType = Math.floor(Math.random() * 3);
      typeCounts[shapeType]++;
      
      gIndices.push(i);
      
      const v = new THREE.Vector3(
          Math.random() - 0.5, 
          Math.random() - 0.5, 
          Math.random() - 0.5
      ).normalize();
      gNormals.push(v.x, v.y, v.z);

      // --- GALAXY POSITIONS ---
      const t = Math.random();
      const radius = Math.pow(t, 1.2) * GALAXY_RADIUS; 
      // DistRatio is needed for both Galaxy colors and Tree body scaling
      const distRatio = radius / GALAXY_RADIUS;
      
      const branchAngle = (i % branches) * ((2 * Math.PI) / branches);
      const curveAngle = radius * 0.3 * spin;
      const randomSpread = (Math.random() - 0.5) * (0.5 + radius * 0.05); 
      
      const angle = branchAngle + curveAngle + randomSpread;

      let gx = Math.cos(angle) * radius;
      let gz = Math.sin(angle) * radius;
      let gy = (Math.random() - 0.5) * (2 + (GALAXY_RADIUS - radius) * 0.2) * 1.5;

      // --- TREE POSITIONS & COLORS ---
      let tx, ty, tz;
      let tColor = new THREE.Color();
      let specificScaleMultiplier = 1.0;

      // 3. Top Star Shape
      if (i < STAR_COUNT) {
         // SPECIAL: Index 0 is the center "Mega Halo"
         if (i === 0) {
             tx = 0;
             ty = (TREE_HEIGHT / 2) + 0.8;
             tz = 0;
             tColor.set('#ffffff'); // Pure white
             // Make this halo huge compared to others
             specificScaleMultiplier = 5.0; 
             hIndices.push(i); // Add to halo list
             
             // Override galaxy pos to center to look nice during transition
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
      // 4. Garland / Ribbon (EXTREMELY DENSE)
      else if (i < STAR_COUNT + GARLAND_COUNT) {
         const garlandIndex = i - STAR_COUNT;
         const progress = garlandIndex / GARLAND_COUNT; // 0 to 1 (Top to Bottom)
         
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
         
         // Highlight Logic (MODIFIED for sparsity)
         let isHalo = false;
         
         // Only consider adding a halo if we are far enough from the last one
         if (i - lastHaloIndex > MIN_HALO_GAP) {
             // 4% chance (very sparse)
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
      // Tree Body
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

      // --- GALAXY COLORS ---
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
    if (!meshDiamondRef.current || !meshShardRef.current || !meshOrbRef.current) return;

    if (glareMatRef.current) {
        glareMatRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
        glareMatRef.current.uniforms.uCamPos.value.copy(camera.position);
        glareMatRef.current.uniforms.uLightPos.value.copy(lightPos);
    }
    
    if (haloMatRef.current) {
        haloMatRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
    }

    const lerpFactor = THREE.MathUtils.clamp(delta * 2.0, 0, 1);
    
    // Smoothly transition halo visibility: 1.0 for TREE, 0.0 for GALAXY
    const targetHaloScale = shape === ShapeType.TREE ? 1.0 : 0.0;
    haloScaleFactor.current = THREE.MathUtils.lerp(haloScaleFactor.current, targetHaloScale, delta * 3.0);

    const rotSpeed = delta * 0.04;

    const newRotY = meshDiamondRef.current.rotation.y + rotSpeed;
    meshDiamondRef.current.rotation.y = newRotY;
    meshShardRef.current.rotation.y = newRotY;
    meshOrbRef.current.rotation.y = newRotY;
    
    if (meshGlareRef.current) meshGlareRef.current.rotation.y = newRotY;
    if (meshHaloRef.current) meshHaloRef.current.rotation.y = newRotY;

    let idx0 = 0;
    let idx1 = 0;
    let idx2 = 0;

    particles.forEach((particle) => {
      const target = shape === ShapeType.TREE ? particle.targetPos.tree : particle.targetPos.galaxy;
      particle.currentPos.lerp(target, lerpFactor);

      const targetCol = shape === ShapeType.TREE ? particle.targetColor.tree : particle.targetColor.galaxy;
      particle.currentColor.lerp(targetCol, lerpFactor);

      particle.rotation.x += particle.rotationSpeed.x;
      particle.rotation.y += particle.rotationSpeed.y;
      
      tempObject.position.copy(particle.currentPos);
      tempObject.rotation.copy(particle.rotation);
      tempObject.scale.setScalar(particle.scale);
      tempObject.updateMatrix();

      if (particle.shapeType === 0) {
        meshDiamondRef.current!.setMatrixAt(idx0, tempObject.matrix);
        meshDiamondRef.current!.setColorAt(idx0, particle.currentColor);
        idx0++;
      } else if (particle.shapeType === 1) {
        meshShardRef.current!.setMatrixAt(idx1, tempObject.matrix);
        meshShardRef.current!.setColorAt(idx1, particle.currentColor);
        idx1++;
      } else {
        meshOrbRef.current!.setMatrixAt(idx2, tempObject.matrix);
        meshOrbRef.current!.setColorAt(idx2, particle.currentColor);
        idx2++;
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
            
            // Multiply particle scale by the global halo fade factor (0 for galaxy, 1 for tree)
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
      // MODIFIED: Radius starts from near 0 to 80 (No hole)
      // Using sqrt for more uniform distribution (less clumping in center than linear)
      const r = Math.sqrt(Math.random()) * 80; 
      
      const theta = Math.random() * Math.PI * 2;
      const ySpread = (Math.random() - 0.5) * 40; 
      
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);
      const y = ySpread;
      const speed = (Math.random() * 0.01) + 0.005; 
      
      // MODIFIED: Brighter Silver/White Color
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
      // MODIFIED: Reduced speed by 50% (was 0.5)
      d.angle += d.speed * delta * 0.25; 
      const nx = Math.cos(d.angle) * d.radius;
      const nz = Math.sin(d.angle) * d.radius;
      const time = state.clock.getElapsedTime();
      
      // MODIFIED: Reduced vertical bobbing frequency by 50% (was 0.5)
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