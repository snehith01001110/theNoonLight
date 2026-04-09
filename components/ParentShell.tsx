'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGraphStore } from '@/lib/store';

/**
 * Renders a subtle translucent shell around the entire scene when the user has
 * dived into a node, making it visually clear that the current web of nodes
 * lives *inside* the parent. Also shows the parent's name floating at the top.
 */
export default function ParentShell() {
  const currentParent = useGraphStore((s) => s.currentParent);
  const phase = useGraphStore((s) => s.diveAnimation.phase);
  const shellRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  // Gentle pulsing rotation on the shell
  useFrame(({ clock }) => {
    if (shellRef.current) {
      shellRef.current.rotation.y = clock.elapsedTime * 0.015;
      shellRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.01) * 0.03;
    }
    // Subtle opacity pulse
    if (matRef.current) {
      const t = clock.elapsedTime;
      matRef.current.opacity = 0.045 + Math.sin(t * 0.5) * 0.015;
    }
  });

  // Only show when we're inside a parent (not at root level)
  if (!currentParent || phase !== 'idle') return null;

  return (
    <>
      {/* Large enclosing sphere — the "boundary" of the parent node.
          Emerald matches the active/clicked node color for visual continuity. */}
      <mesh ref={shellRef}>
        <sphereGeometry args={[11, 40, 40]} />
        <meshBasicMaterial
          ref={matRef}
          color="#34d399"
          transparent
          opacity={0.03}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* Faint ring at the equator to reinforce the boundary */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[10.8, 11, 80]} />
        <meshBasicMaterial
          color="#34d399"
          transparent
          opacity={0.06}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Parent label floating at the top of the shell */}
      <Html
        position={[0, 10.2, 0]}
        center
        distanceFactor={20}
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            color: '#6ee7b7',
            fontSize: '11px',
            fontWeight: 300,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            textShadow: '0 0 12px rgba(52,211,153,0.4)',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            opacity: 0.55,
          }}
        >
          inside: {currentParent.label}
        </div>
      </Html>
    </>
  );
}
