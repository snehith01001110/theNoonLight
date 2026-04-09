'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useGraphStore } from '@/lib/store';

const DEFAULT_CAMERA = new THREE.Vector3(0, 4, 14);

export default function CameraController() {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const diveAnimation = useGraphStore((s) => s.diveAnimation);

  const anim = useRef({
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    lookFrom: new THREE.Vector3(),
    lookTo: new THREE.Vector3(),
    startTime: 0,
    duration: 700,
    active: false,
  });

  useEffect(() => {
    if (diveAnimation.phase === 'previewing' && diveAnimation.targetPos) {
      const target = new THREE.Vector3(
        diveAnimation.targetPos.x,
        diveAnimation.targetPos.y,
        diveAnimation.targetPos.z
      );

      // Compute a destination that's close to the target, approached from
      // a consistent direction (slightly offset from the node toward the
      // camera). This works regardless of where the camera currently is.
      const camToTarget = target.clone().sub(camera.position);
      const dist = camToTarget.length();
      const dir = camToTarget.normalize();
      // Stop 1.2 units short of the target — close enough to see the
      // preview web growing inside but not clipping through.
      const closeOffset = Math.max(1.2, dist * 0.1);
      const dest = target.clone().sub(dir.multiplyScalar(closeOffset));

      anim.current.from.copy(camera.position);
      anim.current.to.copy(dest);
      // Smoothly shift the look-at from world origin to the target node
      anim.current.lookFrom.set(0, 0, 0);
      anim.current.lookTo.copy(target);
      anim.current.startTime = performance.now();
      anim.current.duration = 700;
      anim.current.active = true;
      if (controlsRef.current) controlsRef.current.enabled = false;
    } else if (diveAnimation.phase === 'emerging') {
      // After children are promoted to the outer view, pull camera back
      // from a close starting point to the default overview position.
      // The close start simulates "emerging from inside".
      const start = new THREE.Vector3(0, 0.5, 2.5);
      camera.position.copy(start);

      anim.current.from.copy(start);
      anim.current.to.copy(DEFAULT_CAMERA);
      anim.current.lookFrom.set(0, 0, 0);
      anim.current.lookTo.set(0, 0, 0);
      anim.current.startTime = performance.now();
      anim.current.duration = 650;
      anim.current.active = true;
      if (controlsRef.current) controlsRef.current.enabled = false;
    } else {
      anim.current.active = false;
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.enabled = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diveAnimation.phase, diveAnimation.startedAt]);

  const _lookAt = new THREE.Vector3();

  useFrame(() => {
    if (!anim.current.active) return;
    const elapsed = performance.now() - anim.current.startTime;
    const t = Math.min(1, elapsed / anim.current.duration);
    // easeInOutCubic
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    camera.position.lerpVectors(anim.current.from, anim.current.to, ease);
    _lookAt.lerpVectors(anim.current.lookFrom, anim.current.lookTo, ease);
    camera.lookAt(_lookAt);
    if (t >= 1) {
      anim.current.active = false;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableRotate={true}
      enableZoom={true}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.7}
      zoomSpeed={0.8}
      minDistance={3}
      maxDistance={40}
      target={[0, 0, 0]}
    />
  );
}
