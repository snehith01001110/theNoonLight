/**
 * Force-directed 3D graph layout.
 *
 * Forces applied:
 * 1. Center gravity — all nodes pulled toward origin, strength ∝ relevance
 * 2. Edge springs  — connected nodes attract each other (shorter rest length)
 * 3. Repulsion     — all nodes repel each other to avoid overlap (Coulomb-like)
 * 4. Spherical bound — soft barrier keeps nodes within a max radius
 *
 * The simulation runs synchronously for a fixed number of iterations
 * (deterministic, ~2-5ms for 15 nodes) so it can be called inline.
 */

export interface ForceNode {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** 0–1, how central to parent topic (higher = stronger gravity to center) */
  relevance: number;
  /** 0–1, breadth of topic (affects repulsion radius so big nodes get space) */
  size: number;
}

export interface ForceEdge {
  source: number;
  target: number;
  /** Optional 0–1 strength override. Default 1. */
  weight?: number;
}

export interface ForceLayoutOptions {
  /** Number of simulation ticks. Default 120. */
  iterations?: number;
  /** Base sphere radius — nodes orbit around this distance. Default 5. */
  baseRadius?: number;
  /** Center gravity strength multiplier. Default 0.06. */
  gravityStrength?: number;
  /** Edge spring strength. Default 0.04. */
  springStrength?: number;
  /** Ideal spring rest length. Default 2.5. */
  springLength?: number;
  /** Repulsion strength (Coulomb constant). Default 3.0. */
  repulsion?: number;
  /** Max boundary radius. Default 8.0. */
  boundaryRadius?: number;
  /** Damping factor per tick. Default 0.92. */
  damping?: number;
}

/**
 * Seed initial positions on a Fibonacci sphere so the simulation converges
 * fast (start roughly spread, not clumped at origin).
 */
function seedPositions(count: number, radius: number): ForceNode[] {
  const phi = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (i / (count - 1 || 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const t = phi * i;
    const jitter = 0.85 + ((i * 17) % 7) / 30;
    return {
      x: Math.cos(t) * r * radius * jitter,
      y: y * radius * 0.75 * jitter,
      z: Math.sin(t) * r * radius * jitter,
      vx: 0,
      vy: 0,
      vz: 0,
      relevance: 0.5,
      size: 0.5,
    };
  });
}

export function forceLayout(
  nodeCount: number,
  edges: ForceEdge[],
  relevance: number[],
  sizes: number[],
  opts: ForceLayoutOptions = {}
): { x: number; y: number; z: number }[] {
  if (nodeCount === 0) return [];
  if (nodeCount === 1) return [{ x: 0, y: 0, z: 0 }];

  const {
    iterations = 120,
    baseRadius = 5,
    gravityStrength = 0.06,
    springStrength = 0.04,
    springLength = 2.5,
    repulsion = 3.0,
    boundaryRadius = 8.0,
    damping = 0.92,
  } = opts;

  // Initialize nodes
  const nodes = seedPositions(nodeCount, baseRadius);
  for (let i = 0; i < nodeCount; i++) {
    nodes[i].relevance = relevance[i] ?? 0.5;
    nodes[i].size = sizes[i] ?? 0.5;
  }

  // Build adjacency for quick lookup
  const adjacency = new Map<number, Set<number>>();
  for (const e of edges) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
    if (!adjacency.has(e.target)) adjacency.set(e.target, new Set());
    adjacency.get(e.source)!.add(e.target);
    adjacency.get(e.target)!.add(e.source);
  }

  // Simulation loop
  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations; // cooling schedule

    // --- Force 1: Center gravity ---
    // High-relevance nodes are pulled more strongly toward center
    for (let i = 0; i < nodeCount; i++) {
      const n = nodes[i];
      const dist = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
      if (dist < 0.01) continue;

      // Desired orbit radius: high relevance → closer to center
      const desiredDist = baseRadius * (0.3 + (1 - n.relevance) * 0.7);
      const delta = dist - desiredDist;
      const strength = gravityStrength * alpha * (0.5 + n.relevance * 0.5);

      n.vx -= (n.x / dist) * delta * strength;
      n.vy -= (n.y / dist) * delta * strength;
      n.vz -= (n.z / dist) * delta * strength;
    }

    // --- Force 2: Edge springs ---
    for (const e of edges) {
      const a = nodes[e.source];
      const b = nodes[e.target];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
      const w = e.weight ?? 1;

      // Rest length is shorter for strongly weighted edges
      const rest = springLength * (1.2 - w * 0.4);
      const displacement = dist - rest;
      const force = springStrength * displacement * alpha * w;

      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const fz = (dz / dist) * force;

      a.vx += fx;
      a.vy += fy;
      a.vz += fz;
      b.vx -= fx;
      b.vy -= fy;
      b.vz -= fz;
    }

    // --- Force 3: Repulsion (all pairs) ---
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const dist = Math.sqrt(distSq) || 0.1;

        // Larger nodes need more personal space
        const sizeBoost = 1 + (a.size + b.size) * 0.5;
        const force = (repulsion * sizeBoost * alpha) / (distSq + 0.5);

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;

        a.vx -= fx;
        a.vy -= fy;
        a.vz -= fz;
        b.vx += fx;
        b.vy += fy;
        b.vz += fz;
      }
    }

    // --- Force 4: Boundary enforcement ---
    for (let i = 0; i < nodeCount; i++) {
      const n = nodes[i];
      const dist = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
      if (dist > boundaryRadius) {
        const excess = dist - boundaryRadius;
        const pushBack = 0.3 * excess * alpha;
        n.vx -= (n.x / dist) * pushBack;
        n.vy -= (n.y / dist) * pushBack;
        n.vz -= (n.z / dist) * pushBack;
      }
    }

    // --- Apply velocities and damping ---
    for (let i = 0; i < nodeCount; i++) {
      const n = nodes[i];
      n.vx *= damping;
      n.vy *= damping;
      n.vz *= damping;

      // Clamp velocity to prevent explosions
      const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy + n.vz * n.vz);
      const maxSpeed = 1.5;
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        n.vx *= scale;
        n.vy *= scale;
        n.vz *= scale;
      }

      n.x += n.vx;
      n.y += n.vy;
      n.z += n.vz;
    }
  }

  return nodes.map((n) => ({ x: n.x, y: n.y, z: n.z }));
}
