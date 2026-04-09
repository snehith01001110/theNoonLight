'use client';

// Standalone NodeLabel component kept for modularity;
// GraphNodes currently inlines the label via drei's <Html> for performance.
import { Html } from '@react-three/drei';

export default function NodeLabel({
  position,
  label,
  color,
  showChildren,
}: {
  position: [number, number, number];
  label: string;
  color: string;
  showChildren?: boolean;
}) {
  return (
    <Html position={position} center distanceFactor={12} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          color,
          fontSize: '14px',
          fontWeight: 300,
          whiteSpace: 'nowrap',
          textShadow: '0 0 6px rgba(0,0,0,0.8)',
          letterSpacing: '0.02em',
        }}
      >
        {label}
        {showChildren && (
          <div
            style={{
              fontSize: '9px',
              opacity: 0.6,
              letterSpacing: '0.2em',
              marginTop: '2px',
            }}
          >
            ●●●
          </div>
        )}
      </div>
    </Html>
  );
}
