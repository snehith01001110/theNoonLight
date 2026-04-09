'use client';

import { Canvas } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import CameraController from './CameraController';
import GraphNodes from './GraphNodes';
import GraphEdges from './GraphEdges';
import ParentShell from './ParentShell';

export default function Scene() {
  return (
    <Canvas
      camera={{ position: [0, 4, 14], fov: 55 }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
      style={{ background: 'radial-gradient(ellipse at center, #0d0f1a 0%, #050508 75%)' }}
    >
      <color attach="background" args={['#05060b']} />
      <fog attach="fog" args={['#05060b', 14, 60]} />

      {/* Key lights — colors mirror the node semantic palette:
          sky blue = root/home, emerald = active focus,
          amber = ancestor context above, violet = visited paths */}
      <ambientLight intensity={0.35} />
      <pointLight position={[10, 14, 8]} intensity={1.2} color="#38bdf8" distance={40} />
      <pointLight position={[-12, -6, -6]} intensity={0.7} color="#a78bfa" distance={40} />
      <pointLight position={[0, 12, -8]} intensity={0.5} color="#f59e0b" distance={35} />
      <pointLight position={[8, 2, -12]} intensity={0.5} color="#34d399" distance={30} />
      <directionalLight position={[5, 10, 5]} intensity={0.3} color="#ffffff" />

      <Stars radius={120} depth={60} count={800} factor={3} saturation={0.3} fade speed={0.4} />

      <CameraController />
      <ParentShell />
      <GraphEdges />
      <GraphNodes />
    </Canvas>
  );
}
