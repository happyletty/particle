import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ShapeType } from '../types';

interface ParticleSceneProps {
  shape: ShapeType;
}

const COUNT = 6000;
const GALAXY_RADIUS = 30;
const TREE_HEIGHT = 40;
const TREE_RADIUS = 15;

const ParticleScene: React.FC<ParticleSceneProps> = ({ shape }) => {
  const pointsRef = useRef<THREE.Points>(null);
  
  // Initialize particles
  const { positions, colors, galaxyPos, treePos } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    
    const gPos = new Float32Array(COUNT * 3);
    const tPos = new Float32Array(COUNT * 3);

    const color1 = new THREE.Color('#4f46e5'); // Indigo
    const color2 = new THREE.Color('#ec4899'); // Pink
    const color3 = new THREE.Color('#fbbf24'); // Amber (Stars/Lights)
    const colorTree = new THREE.Color('#10b981'); // Emerald
    const colorRed = new THREE.Color('#ef4444'); // Red ornaments

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;

      // --- GALAXY SHAPE GENERATION ---
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * GALAXY_RADIUS;
      const spiralAngle = angle + radius * 0.5;
      const randomX = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * (GALAXY_RADIUS * 0.3); // Scatter
      const randomY = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * (GALAXY_RADIUS * 0.3);
      const randomZ = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * (GALAXY_RADIUS * 0.3);

      gPos[i3] = Math.cos(spiralAngle) * radius + randomX;
      gPos[i3 + 1] = (Math.random() - 0.5) * 5 + randomY; // Flattened y
      gPos[i3 + 2] = Math.sin(spiralAngle) * radius + randomZ;

      // --- TREE SHAPE GENERATION ---
      // Cone shape
      const h = Math.random() * TREE_HEIGHT; // 0 to Height
      const relHeight = h / TREE_HEIGHT; // 0 to 1
      const currentRadius = TREE_RADIUS * (1 - relHeight); 
      const treeAngle = Math.random() * Math.PI * 2 * 5; // More spins
      
      tPos[i3] = Math.cos(treeAngle) * currentRadius * Math.random();
      tPos[i3 + 1] = h - (TREE_HEIGHT / 2); // Center vertically
      tPos[i3 + 2] = Math.sin(treeAngle) * currentRadius * Math.random();

      // Initial Position (start at Galaxy)
      pos[i3] = gPos[i3];
      pos[i3 + 1] = gPos[i3 + 1];
      pos[i3 + 2] = gPos[i3 + 2];

      // Colors - Initialize as Galaxy
      const mixedColor = color1.clone().lerp(color2, Math.random());
      if (Math.random() > 0.9) mixedColor.lerp(color3, 0.8);
      
      col[i3] = mixedColor.r;
      col[i3 + 1] = mixedColor.g;
      col[i3 + 2] = mixedColor.b;
    }

    return { positions: pos, colors: col, galaxyPos: gPos, treePos: tPos };
  }, []);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;

    const positionsAttribute = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const colorsAttribute = pointsRef.current.geometry.attributes.color as THREE.BufferAttribute;
    
    // Animation Speed
    const lerpFactor = THREE.MathUtils.clamp(delta * 2.5, 0, 1);

    // Target arrays based on shape
    const targetPositions = shape === ShapeType.TREE ? treePos : galaxyPos;
    
    // Color targets
    const galaxyColorBase = new THREE.Color('#4f46e5');
    const galaxyColorPink = new THREE.Color('#ec4899');
    const treeColorBase = new THREE.Color('#10b981');
    const treeColorRed = new THREE.Color('#ef4444');
    const goldColor = new THREE.Color('#fbbf24');

    // Rotate the whole system slightly
    pointsRef.current.rotation.y += delta * 0.1;

    for (let i = 0; i < COUNT; i++) {
      const i3 = i * 3;

      // Interpolate Position
      positionsAttribute.array[i3] += (targetPositions[i3] - positionsAttribute.array[i3]) * lerpFactor;
      positionsAttribute.array[i3 + 1] += (targetPositions[i3 + 1] - positionsAttribute.array[i3 + 1]) * lerpFactor;
      positionsAttribute.array[i3 + 2] += (targetPositions[i3 + 2] - positionsAttribute.array[i3 + 2]) * lerpFactor;

      // Interpolate Color logic
      // We process colors slightly differently to add sparkle
      const isOrnament = i % 50 === 0;
      let targetR, targetG, targetB;

      if (shape === ShapeType.TREE) {
         if (isOrnament) {
             targetR = treeColorRed.r; targetG = treeColorRed.g; targetB = treeColorRed.b;
         } else if (i % 20 === 0) {
             targetR = goldColor.r; targetG = goldColor.g; targetB = goldColor.b;
         } else {
             targetR = treeColorBase.r; targetG = treeColorBase.g; targetB = treeColorBase.b;
         }
      } else {
         // Galaxy colors logic restoration is complex per particle, approximate for transition
         const isCenter = Math.abs(galaxyPos[i3]) < 5 && Math.abs(galaxyPos[i3+2]) < 5;
         if (isCenter) {
            targetR = goldColor.r; targetG = goldColor.g; targetB = goldColor.b;
         } else {
            // Gradient mix based on index for stability
            const mix = (Math.sin(i * 0.1) + 1) / 2; 
            targetR = galaxyColorBase.r * mix + galaxyColorPink.r * (1-mix);
            targetG = galaxyColorBase.g * mix + galaxyColorPink.g * (1-mix);
            targetB = galaxyColorBase.b * mix + galaxyColorPink.b * (1-mix);
         }
      }
      
      colorsAttribute.array[i3] += (targetR - colorsAttribute.array[i3]) * lerpFactor;
      colorsAttribute.array[i3 + 1] += (targetG - colorsAttribute.array[i3 + 1]) * lerpFactor;
      colorsAttribute.array[i3 + 2] += (targetB - colorsAttribute.array[i3 + 2]) * lerpFactor;
    }

    positionsAttribute.needsUpdate = true;
    colorsAttribute.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.4}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
};

export default ParticleScene;