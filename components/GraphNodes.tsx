'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGraphStore } from '@/lib/store';
import type { GraphNode } from '@/lib/types';

// Meaningful color scheme:
// - Root topics (added by the user): sky blue — the "home base" hue
// - Unvisited child: neutral slate — unexplored, no emphasis
// - Visited child (already dived into): violet — you've been here
// - Current parent (the node we're "inside"): emerald — active focus
// - Outer context (previous level ghosts): warm amber — "above/behind you"
const COLORS = {
  root: { sphere: '#38bdf8', label: '#bae6fd' },
  unvisited: { sphere: '#64748b', label: '#94a3b8' },
  visited: { sphere: '#a78bfa', label: '#ddd6fe' },
  active: { sphere: '#34d399', label: '#6ee7b7' },
  // Amber/gold for ancestor nodes — visually warm = "past / above"
  outer: { sphere: '#f59e0b', label: '#fde68a' },
};

function pickColor(node: GraphNode, isActive: boolean) {
  if (isActive) return COLORS.active;
  if (node.is_root) return COLORS.root;
  if (node.visited) return COLORS.visited;
  return COLORS.unvisited;
}

function NodeMesh({
  node,
  index,
  scale = 1,
  interactive = true,
  isActive = false,
  opacity = 1,
  overrideColor,
}: {
  node: GraphNode;
  index: number;
  scale?: number;
  interactive?: boolean;
  isActive?: boolean;
  opacity?: number;
  overrideColor?: { sphere: string; label: string };
}) {
  const group = useRef<THREE.Group>(null);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null);
  const baseY = node.position_y;
  const diveInto = useGraphStore((s) => s.diveInto);
  const color = overrideColor ?? pickColor(node, isActive);

  const pointerDown = useRef({ x: 0, y: 0, time: 0 });

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (group.current) {
      group.current.position.y = baseY + Math.sin(t * 0.8 + index * 0.7) * 0.06;
    }
    if (coreMat.current) {
      coreMat.current.emissiveIntensity = 0.4 + Math.sin(t * 1.2 + index) * 0.08;
    }
  });

  // topicSize (0–1) expands the sphere for broad topics, shrinks for narrow ones.
  // Range: 0.28× (tiny concept) to 1.6× (major field), centered at 1.0 for 0.5 size.
  const topicSizeFactor = node.topicSize !== undefined
    ? 0.28 + node.topicSize * 1.32
    : 1.0;
  const baseRadius = node.is_root ? 0.5 : 0.38;
  const radius = baseRadius * scale * topicSizeFactor;
  const glow1 = (node.is_root ? 0.95 : 0.72) * scale * topicSizeFactor;
  const glow2 = (node.is_root ? 1.35 : 1.05) * scale * topicSizeFactor;

  return (
    <group
      ref={group}
      position={[node.position_x, node.position_y, node.position_z]}
    >
      <mesh
        onPointerDown={(e) => {
          if (!interactive) return;
          pointerDown.current = {
            x: (e as any).clientX ?? 0,
            y: (e as any).clientY ?? 0,
            time: performance.now(),
          };
        }}
        onPointerUp={(e) => {
          if (!interactive) return;
          const dx = ((e as any).clientX ?? 0) - pointerDown.current.x;
          const dy = ((e as any).clientY ?? 0) - pointerDown.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const dt = performance.now() - pointerDown.current.time;
          if (dist < 6 && dt < 350) {
            diveInto(node.id);
          }
        }}
        onPointerOver={() => {
          if (!interactive) return;
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          if (!interactive) return;
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[radius, 28, 28]} />
        <meshStandardMaterial
          ref={coreMat}
          color={color.sphere}
          emissive={color.sphere}
          emissiveIntensity={0.45}
          roughness={0.3}
          metalness={0.25}
          transparent
          opacity={opacity}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[glow1, 20, 20]} />
        <meshBasicMaterial
          color={color.sphere}
          transparent
          opacity={0.12 * opacity}
          depthWrite={false}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[glow2, 20, 20]} />
        <meshBasicMaterial
          color={color.sphere}
          transparent
          opacity={0.05 * opacity}
          depthWrite={false}
        />
      </mesh>

      {scale >= 0.6 && (
        <Html
          position={[0, 0, 0]}
          center
          style={{ pointerEvents: 'none' }}
          zIndexRange={[0, 0]}
        >
          <div
            style={{
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              textShadow: `0 0 12px ${color.sphere}, 0 0 6px ${color.sphere}, 0 1px 4px rgba(0,0,0,1)`,
              letterSpacing: '0.03em',
              textAlign: 'center',
              opacity,
              transform: `scale(${0.7 + radius * 0.5})`,
            }}
          >
            {node.label}
            {node.visited && !isActive && (
              <div
                style={{
                  fontSize: '7px',
                  opacity: 0.5,
                  letterSpacing: '0.25em',
                  marginTop: '2px',
                }}
              >
                ●●●
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * Scale factor to push outer-context ghost nodes beyond the ParentShell
 * radius (11). Original child positions sit on a sphere of radius ~5,
 * so 2.8× puts them at ~14 — comfortably outside the shell.
 */
const OUTER_SCALE = 2.8;

export default function GraphNodes() {
  const currentNodes = useGraphStore((s) => s.currentNodes);
  const outerContextNodes = useGraphStore((s) => s.outerContextNodes);
  const diveAnimation = useGraphStore((s) => s.diveAnimation);

  const previewing = diveAnimation.phase === 'previewing';
  const previewAnchor = diveAnimation.targetPos;
  const previewNodes = diveAnimation.previewNodes;

  return (
    <>
      {/* Ghost outer-context nodes from the previous level — visible when
          zooming out but not interactive. Scaled beyond the shell boundary.
          Rendered in amber so they read as "ancestor / above you" without
          competing with the current level's cool-toned nodes. */}
      {outerContextNodes.length > 0 && !previewing && (
        <group scale={OUTER_SCALE}>
          {outerContextNodes.map((node, i) => (
            <NodeMesh
              key={`outer-${node.id}`}
              node={node}
              index={i}
              scale={0.6}
              interactive={false}
              opacity={0.09}
              isActive={false}
              overrideColor={COLORS.outer}
            />
          ))}
        </group>
      )}

      {/* Current level: the active web */}
      {currentNodes.map((node, i) => {
        const isDiving =
          previewing && previewAnchor &&
          node.position_x === previewAnchor.x &&
          node.position_y === previewAnchor.y &&
          node.position_z === previewAnchor.z;
        return (
          <NodeMesh
            key={node.id}
            node={node}
            index={i}
            isActive={!!isDiving}
            opacity={previewing && !isDiving ? 0.35 : 1}
            interactive={!previewing}
          />
        );
      })}

      {/* Inner preview: children appearing inside the clicked node */}
      {previewing && previewAnchor && previewNodes.length > 0 && (
        <group
          position={[previewAnchor.x, previewAnchor.y, previewAnchor.z]}
          scale={0.28}
        >
          {previewNodes.map((n, i) => (
            <NodeMesh
              key={`preview-${n.id}`}
              node={n}
              index={i}
              scale={1}
              interactive={false}
              opacity={0.95}
            />
          ))}
        </group>
      )}
    </>
  );
}
