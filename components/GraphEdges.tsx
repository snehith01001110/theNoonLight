'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { useGraphStore } from '@/lib/store';
import type { GraphNode, EdgePair } from '@/lib/types';

interface LineData {
  key: string;
  geometry: THREE.BufferGeometry;
  weight: number;
}

function buildLines(nodes: GraphNode[], edges: EdgePair[]): LineData[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return edges
    .map(([a, b, weight], i) => {
      const na = byId.get(a);
      const nb = byId.get(b);
      if (!na || !nb) return null;
      const start = new THREE.Vector3(na.position_x, na.position_y, na.position_z);
      const end = new THREE.Vector3(nb.position_x, nb.position_y, nb.position_z);
      const mid = start.clone().add(end).multiplyScalar(0.5);
      // push midpoint slightly outward from origin for a subtle curve
      const outward = mid.clone().normalize().multiplyScalar(0.25);
      mid.add(outward);
      mid.y += 0.08 * Math.sin(i * 1.3);
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const points = curve.getPoints(20);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      return { key: `${a}-${b}`, geometry, weight: typeof weight === 'number' ? weight : 0.5 };
    })
    .filter((x): x is LineData => x !== null);
}

// Render a single tube for a weighted edge
function EdgeTube({ line, opacity, color }: { line: LineData; opacity: number; color: string }) {
  // Weight drives visual prominence:
  // - opacity: 0.15 (weak) to 0.55 (strong)
  // - thickness via tube radius: 0.01 (weak) to 0.04 (strong)
  const w = line.weight;
  const edgeOpacity = opacity * (0.15 + w * 0.4);

  const tubeGeometry = useMemo(() => {
    // Reconstruct curve from the buffer geometry points
    const pos = line.geometry.getAttribute('position');
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i++) {
      points.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const radius = 0.008 + w * 0.032;
    return new THREE.TubeGeometry(curve, 16, radius, 6, false);
  }, [line.geometry, w]);

  return (
    <mesh geometry={tubeGeometry}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={edgeOpacity}
        depthWrite={false}
      />
    </mesh>
  );
}

// The outer scale must match OUTER_SCALE in GraphNodes so ghost edges align
const OUTER_SCALE = 2.8;

export default function GraphEdges() {
  const currentNodes = useGraphStore((s) => s.currentNodes);
  const currentEdges = useGraphStore((s) => s.currentEdges);
  const outerContextNodes = useGraphStore((s) => s.outerContextNodes);
  const diveAnimation = useGraphStore((s) => s.diveAnimation);

  const currentLines = useMemo(
    () => buildLines(currentNodes, currentEdges),
    [currentNodes, currentEdges]
  );

  // Derive outer context edges from the stored nodes
  const outerEdges = useMemo<EdgePair[]>(() => {
    if (outerContextNodes.length < 2) return [];
    const pairs: EdgePair[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < outerContextNodes.length; i++) {
      let bestJ = -1;
      let bestDist = Infinity;
      const a = outerContextNodes[i];
      for (let j = 0; j < outerContextNodes.length; j++) {
        if (i === j) continue;
        const b = outerContextNodes[j];
        const d = Math.hypot(
          a.position_x - b.position_x,
          a.position_y - b.position_y,
          a.position_z - b.position_z
        );
        if (d < bestDist) { bestDist = d; bestJ = j; }
      }
      if (bestJ >= 0) {
        const key = [Math.min(i, bestJ), Math.max(i, bestJ)].join('-');
        if (!seen.has(key)) { seen.add(key); pairs.push([a.id, outerContextNodes[bestJ].id]); }
      }
    }
    return pairs;
  }, [outerContextNodes]);

  const outerLines = useMemo(
    () => buildLines(outerContextNodes, outerEdges),
    [outerContextNodes, outerEdges]
  );

  const previewLines = useMemo(
    () => buildLines(diveAnimation.previewNodes, diveAnimation.previewEdges),
    [diveAnimation.previewNodes, diveAnimation.previewEdges]
  );

  const previewing = diveAnimation.phase === 'previewing';
  const previewAnchor = diveAnimation.targetPos;
  const currentOpacity = previewing ? 0.3 : 1;

  return (
    <>
      {/* Ancestor ghost edges — amber/warm, very faint, scaled to match ghost nodes */}
      {outerLines.length > 0 && !previewing && (
        <group scale={OUTER_SCALE}>
          {outerLines.map((line) => (
            <EdgeTube
              key={`outer-${line.key}`}
              line={line}
              opacity={0.15}
              color="#f59e0b"
            />
          ))}
        </group>
      )}

      {/* Current level edges — weight drives thickness and brightness */}
      {currentLines.map((line) => (
        <EdgeTube
          key={line.key}
          line={line}
          opacity={currentOpacity}
          color="#818cf8"
        />
      ))}

      {/* Preview edges inside the clicked node */}
      {previewing && previewAnchor && previewLines.length > 0 && (
        <group
          position={[previewAnchor.x, previewAnchor.y, previewAnchor.z]}
          scale={0.28}
        >
          {previewLines.map((line) => (
            <EdgeTube
              key={`preview-${line.key}`}
              line={line}
              opacity={0.7}
              color="#a5b4fc"
            />
          ))}
        </group>
      )}
    </>
  );
}
