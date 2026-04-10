'use client';

import { create } from 'zustand';
import type { GraphNode, Position3D, EdgePair } from './types';
import { createClient } from './supabase-browser';
import { forceLayout, ForceEdge } from './force-layout';

export type DivePhase = 'idle' | 'previewing' | 'emerging';
export type SummaryStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface DiveAnimation {
  phase: DivePhase;
  targetPos: Position3D | null;
  previewNodes: GraphNode[];
  previewEdges: EdgePair[];
  startedAt: number;
}

interface SubtopicsJson {
  titles: string[];
  edges: [number, number][];
  /** Per-edge relationship weight (0–1, drives spring attraction) */
  edge_weights?: number[];
  /** Per-title relevance to the parent topic (0–1, drives orbit radius) */
  relevance?: number[];
  /** Per-title breadth/size as a knowledge field (0–1, drives sphere radius) */
  size?: number[];
}

interface GraphState {
  userId: string | null;
  path: string[];
  rootNodes: GraphNode[];
  currentNodes: GraphNode[];
  currentEdges: EdgePair[];
  currentParent: GraphNode | null;
  outerContextNodes: GraphNode[];
  loading: boolean;
  loadingMessage: string;
  sidebarOpen: boolean;
  summaryStatus: SummaryStatus;
  diveAnimation: DiveAnimation;

  setUserId: (id: string | null) => void;
  loadInitial: () => Promise<void>;
  startTopic: (query: string) => Promise<void>;
  diveInto: (nodeId: string) => Promise<void>;
  goBack: () => void;
  goToLevel: (depth: number, openSidebar?: boolean) => Promise<void>;
  reset: () => Promise<void>;
  setSidebarOpen: (open: boolean) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const VIRTUAL_PREFIX = 'v|';

function makeVirtualId(parentId: string, title: string): string {
  return `${VIRTUAL_PREFIX}${parentId}|${title}`;
}

function parseVirtualId(
  id: string
): { parentId: string; title: string } | null {
  if (!id.startsWith(VIRTUAL_PREFIX)) return null;
  const rest = id.slice(VIRTUAL_PREFIX.length);
  // parentId is a UUID (36 chars), then |, then the title
  const sep = rest.indexOf('|');
  if (sep < 0) return null;
  return { parentId: rest.slice(0, sep), title: rest.slice(sep + 1) };
}

function isVirtualId(id: string): boolean {
  return id.startsWith(VIRTUAL_PREFIX);
}

async function fetchRootNodes(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('graph_nodes')
    .select('*')
    .eq('user_id', userId)
    .is('parent_id', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as GraphNode[];
}

async function fetchNodeById(supabase: any, id: string) {
  const { data, error } = await supabase
    .from('graph_nodes')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as GraphNode;
}

async function fetchAncestorTitles(
  supabase: any,
  path: string[]
): Promise<string[]> {
  if (path.length === 0) return [];
  const { data, error } = await supabase
    .from('graph_nodes')
    .select('id, wiki_title')
    .in('id', path);
  if (error || !data) return [];
  const byId = new Map<string, string>(
    (data as { id: string; wiki_title: string }[]).map((r) => [
      r.id,
      r.wiki_title,
    ])
  );
  return path.map((id) => byId.get(id)).filter((t): t is string => !!t);
}

/**
 * Walk up parent_id links from a node to reconstruct its full ancestor path.
 * Returns [root_id, ..., parent_id] (does NOT include the node itself).
 */
async function buildAncestorPath(
  supabase: any,
  nodeId: string
): Promise<string[]> {
  const path: string[] = [];
  let currentId: string | null = nodeId;

  // Fetch the starting node to get its parent_id
  const { data: startNode } = await supabase
    .from('graph_nodes')
    .select('parent_id')
    .eq('id', currentId)
    .single();
  currentId = startNode?.parent_id ?? null;

  // Walk up the chain (max 20 levels to prevent infinite loops)
  let safety = 20;
  while (currentId && safety-- > 0) {
    path.unshift(currentId);
    const { data: ancestor } = await supabase
      .from('graph_nodes')
      .select('parent_id')
      .eq('id', currentId)
      .single();
    currentId = ancestor?.parent_id ?? null;
  }
  return path;
}

/** Ask Haiku to curate subtopics from Wikipedia links. */
async function curateSubtopics(
  topic: string,
  exclude: string[],
  retries = 2
): Promise<SubtopicsJson> {
  try {
    const res = await fetch('/api/subtopics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, exclude }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error(`[subtopics] ${res.status} for "${topic}":`, body);
      if (retries > 0 && res.status >= 500) {
        await new Promise((ok) => setTimeout(ok, 1000));
        return curateSubtopics(topic, exclude, retries - 1);
      }
      return { titles: [], edges: [] };
    }
    const data = await res.json();
    return {
      titles: Array.isArray(data.subtopics) ? data.subtopics : [],
      edges: Array.isArray(data.edges) ? data.edges : [],
      edge_weights: Array.isArray(data.edge_weights) ? data.edge_weights : undefined,
      relevance: Array.isArray(data.relevance) ? data.relevance : undefined,
      size: Array.isArray(data.size) ? data.size : undefined,
    };
  } catch (err) {
    console.error(`[subtopics] network error for "${topic}":`, err);
    if (retries > 0) {
      await new Promise((ok) => setTimeout(ok, 1000));
      return curateSubtopics(topic, exclude, retries - 1);
    }
    return { titles: [], edges: [] };
  }
}

/**
 * Build virtual GraphNode objects from a parent's subtopics_json.
 * Positions are computed deterministically from the title count.
 * visited is true for titles that have a real DB row (user dived in).
 *
 * When relevance scores are available, more relevant nodes are placed
 * closer to the center (orbit radius ∝ 1 - relevance, clamped to [3, 7]).
 * When size scores are available, topicSize is stored on each node and
 * used by NodeMesh to scale the sphere radius.
 */
function buildVirtualChildren(
  parentId: string,
  sj: SubtopicsJson,
  visitedTitles: Set<string>,
  excludeLower: Set<string>
): { nodes: GraphNode[]; edges: EdgePair[] } {
  // Filter titles, keeping track of original indices for relevance/size/edge lookup
  const filteredPairs: { title: string; origIdx: number }[] = [];
  for (let i = 0; i < sj.titles.length; i++) {
    if (!excludeLower.has(sj.titles[i].toLowerCase())) {
      filteredPairs.push({ title: sj.titles[i], origIdx: i });
    }
  }

  // Map original index → filtered index for edge remapping
  const filteredIndexMap = new Map<number, number>();
  for (let fi = 0; fi < filteredPairs.length; fi++) {
    filteredIndexMap.set(filteredPairs[fi].origIdx, fi);
  }

  // Remap edges from original indices to filtered indices, preserving weights
  const forceEdges: ForceEdge[] = [];
  const edgePairs: EdgePair[] = [];
  const edgeSeen = new Set<string>();

  for (let ei = 0; ei < sj.edges.length; ei++) {
    const [a, b] = sj.edges[ei];
    const ia = filteredIndexMap.get(a);
    const ib = filteredIndexMap.get(b);
    if (ia === undefined || ib === undefined) continue;
    const key = `${Math.min(ia, ib)}-${Math.max(ia, ib)}`;
    if (edgeSeen.has(key)) continue;
    edgeSeen.add(key);

    const weight = sj.edge_weights?.[ei] !== undefined
      ? Math.max(0, Math.min(1, sj.edge_weights[ei]))
      : 0.5;
    forceEdges.push({ source: ia, target: ib, weight });
  }

  // Extract relevance and size arrays for filtered nodes
  const relevanceArr = filteredPairs.map(({ origIdx }) =>
    sj.relevance?.[origIdx] !== undefined
      ? Math.max(0, Math.min(1, sj.relevance[origIdx]))
      : 0.5
  );
  const hasSizeData = Array.isArray(sj.size) && sj.size.length > 0;
  const sizeArr = filteredPairs.map(({ origIdx }) =>
    hasSizeData && sj.size![origIdx] !== undefined
      ? Math.max(0, Math.min(1, sj.size![origIdx]))
      : undefined
  );
  // forceLayout needs plain numbers — default missing sizes to 0.5
  const sizeArrNumeric = sizeArr.map((v) => v ?? 0.5);

  // Run force-directed layout — positions now reflect relevance (gravity)
  // and edge weights (springs pull related nodes together)
  const positions = forceLayout(
    filteredPairs.length,
    forceEdges,
    relevanceArr,
    sizeArrNumeric
  );

  const nodes: GraphNode[] = filteredPairs.map(({ title, origIdx }, i) => {
    return {
      id: makeVirtualId(parentId, title),
      user_id: '',
      wiki_title: title,
      label: title,
      summary: null,
      parent_id: parentId,
      position_x: positions[i]?.x ?? 0,
      position_y: positions[i]?.y ?? 0,
      position_z: positions[i]?.z ?? 0,
      is_root: false,
      visited: visitedTitles.has(title.toLowerCase()),
      created_at: '',
      topicSize: sizeArr[i] ?? undefined,
    };
  });

  // Build edge pairs using node IDs, including weights
  for (const fe of forceEdges) {
    if (nodes[fe.source] && nodes[fe.target]) {
      edgePairs.push([nodes[fe.source].id, nodes[fe.target].id, fe.weight ?? 0.5]);
    }
  }

  return { nodes, edges: edgePairs };
}

/** Compute edges between an array of nodes via wiki link Jaccard similarity. */
async function computeNodeEdges(
  nodes: GraphNode[]
): Promise<{ edges: EdgePair[]; linkCounts: number[] }> {
  if (nodes.length < 2) return { edges: [], linkCounts: [] };
  try {
    const res = await fetch('/api/wiki/edges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titles: nodes.map((n) => n.wiki_title) }),
    });
    if (!res.ok) return { edges: [], linkCounts: [] };
    const data = await res.json();
    const linkCounts: number[] = data.linkCounts ?? [];
    const edges = ((data.edges ?? []) as [number, number, number?][])
      .filter(([i, j]) => nodes[i] && nodes[j])
      .map(([i, j, w]) => [nodes[i].id, nodes[j].id, w ?? 0.5] as EdgePair);
    return { edges, linkCounts };
  } catch {
    return { edges: [], linkCounts: [] };
  }
}

/**
 * Compute a semantically-aware force-directed layout for root nodes.
 *
 * Uses Jaccard similarity over Wikipedia link sets as edge weights, link
 * counts as a proxy for topic breadth (size), and edge connectivity as
 * relevance (highly connected roots sit closer to center).
 */
async function layoutRootNodes(
  roots: GraphNode[]
): Promise<{ nodes: GraphNode[]; edges: EdgePair[] }> {
  if (roots.length === 0) return { nodes: [], edges: [] };
  if (roots.length === 1) {
    return {
      nodes: [{ ...roots[0], position_x: 0, position_y: 0, position_z: 0 }],
      edges: [],
    };
  }

  const { edges, linkCounts } = await computeNodeEdges(roots);

  // Build ForceEdge[] from weighted EdgePairs
  const idToIdx = new Map(roots.map((r, i) => [r.id, i]));
  const forceEdges: ForceEdge[] = [];
  for (const ep of edges) {
    const si = idToIdx.get(ep[0]);
    const ti = idToIdx.get(ep[1]);
    if (si !== undefined && ti !== undefined) {
      forceEdges.push({ source: si, target: ti, weight: (ep as [string, string, number])[2] ?? 0.5 });
    }
  }

  // Derive size per root from link counts (normalized 0–1)
  const maxLinks = Math.max(1, ...linkCounts);
  const sizes = roots.map((_, i) => {
    const count = linkCounts[i] ?? 0;
    return Math.max(0.1, count / maxLinks);
  });

  // Derive relevance per root from edge connectivity
  // (average weight of edges connected to this node × connectivity ratio)
  const weightSums = new Array(roots.length).fill(0);
  const edgeCounts = new Array(roots.length).fill(0);
  for (const fe of forceEdges) {
    const w = fe.weight ?? 0.5;
    weightSums[fe.source] += w;
    weightSums[fe.target] += w;
    edgeCounts[fe.source]++;
    edgeCounts[fe.target]++;
  }
  const maxPossibleEdges = roots.length - 1;
  const relevance = roots.map((_, i) => {
    if (edgeCounts[i] === 0) return 0.2; // isolated nodes stay on the periphery
    const avgWeight = weightSums[i] / edgeCounts[i];
    const connectivity = edgeCounts[i] / maxPossibleEdges;
    return Math.max(0.1, Math.min(1, avgWeight * 0.6 + connectivity * 0.4));
  });

  const positions = forceLayout(roots.length, forceEdges, relevance, sizes, {
    baseRadius: 6,
    boundaryRadius: 12,
    springLength: 3.0,
  });

  const laidOut = roots.map((root, i) => ({
    ...root,
    position_x: positions[i]?.x ?? root.position_x,
    position_y: positions[i]?.y ?? root.position_y,
    position_z: positions[i]?.z ?? root.position_z,
    topicSize: sizes[i],
  }));

  // Normalize edge weights from raw Jaccard values (typically 0.01–0.20) to
  // a [0.25, 1.0] visual range so edges are rendered with meaningful thickness.
  // This preserves relative ordering while making all edges visually legible.
  const rawWeights = edges.map((ep) => (ep as [string, string, number])[2] ?? 0);
  const maxW = Math.max(0.001, ...rawWeights);
  const minW = Math.min(...rawWeights);
  const normalizedEdges: EdgePair[] = edges.map((ep) => {
    const raw = (ep as [string, string, number])[2] ?? 0;
    const normalized = minW === maxW
      ? 0.65
      : 0.25 + ((raw - minW) / (maxW - minW)) * 0.75;
    return [ep[0], ep[1], Math.round(normalized * 100) / 100] as EdgePair;
  });

  return { nodes: laidOut, edges: normalizedEdges };
}

/** Which children of parentId have been dived into (have their own row)? */
async function fetchVisitedChildTitles(
  supabase: any,
  parentId: string,
  userId: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from('graph_nodes')
    .select('wiki_title')
    .eq('parent_id', parentId)
    .eq('user_id', userId);
  return new Set(
    ((data as { wiki_title: string }[]) ?? []).map((r) =>
      r.wiki_title.toLowerCase()
    )
  );
}

/**
 * Legacy fallback: build children from old-style child rows (for graphs
 * created before the subtopics_json migration). Also computes edges via
 * the wiki-link-intersection endpoint.
 */
async function legacyChildrenFromRows(
  supabase: any,
  parentId: string,
  userId: string,
  excludeLower: Set<string>
): Promise<{ nodes: GraphNode[]; edges: EdgePair[] } | null> {
  let query = supabase
    .from('graph_nodes')
    .select('*')
    .eq('user_id', userId)
    .eq('parent_id', parentId)
    .order('created_at', { ascending: true });
  const { data, error } = await query;
  if (error) return null;
  const rows = ((data ?? []) as GraphNode[]).filter(
    (c) => !excludeLower.has(c.wiki_title.toLowerCase())
  );
  if (rows.length === 0) return null;

  // Compute edges via wiki link Jaccard similarity
  let edges: EdgePair[] = [];
  if (rows.length >= 2) {
    try {
      const res = await fetch('/api/wiki/edges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titles: rows.map((n) => n.wiki_title) }),
      });
      if (res.ok) {
        const d = await res.json();
        edges = ((d.edges ?? []) as [number, number, number?][])
          .filter(([i, j]) => rows[i] && rows[j])
          .map(([i, j, w]) => [rows[i].id, rows[j].id, w ?? 0.5] as EdgePair);
      }
    } catch {}
  }

  return { nodes: rows, edges };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const DIVE_DURATION = 700;
const EMERGE_DURATION = 600;

const emptyAnimation: DiveAnimation = {
  phase: 'idle',
  targetPos: null,
  previewNodes: [],
  previewEdges: [],
  startedAt: 0,
};

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

export const useGraphStore = create<GraphState>((set, get) => ({
  userId: null,
  path: [],
  rootNodes: [],
  currentNodes: [],
  currentEdges: [],
  currentParent: null,
  outerContextNodes: [],
  loading: false,
  loadingMessage: '',
  sidebarOpen: false,
  summaryStatus: 'idle',
  diveAnimation: emptyAnimation,

  setUserId: (id) => set({ userId: id }),

  /* ---- Load root topics on page load ---- */
  loadInitial: async () => {
    const { userId } = get();
    if (!userId) return;
    set({ loading: true, loadingMessage: 'Loading your graph...' });
    try {
      const supabase = createClient();
      const roots = await fetchRootNodes(supabase, userId);
      const { nodes: laidOut, edges } = await layoutRootNodes(roots);

      // Persist force-layout positions so DB stays fresh (fire-and-forget)
      for (const u of laidOut) {
        supabase
          .from('graph_nodes')
          .update({
            position_x: u.position_x,
            position_y: u.position_y,
            position_z: u.position_z,
          })
          .eq('id', u.id)
          .then(() => {});
      }

      set({
        rootNodes: laidOut,
        currentNodes: laidOut,
        currentEdges: edges,
        currentParent: null,
        outerContextNodes: [],
        path: [],
        sidebarOpen: false,
      });
    } finally {
      set({ loading: false, loadingMessage: '' });
    }
  },

  /* ---- Add a new root topic ---- */
  startTopic: async (query: string) => {
    const { userId } = get();
    if (!userId || !query.trim()) return;
    set({ loading: true, loadingMessage: `Thinking about "${query}"...` });
    try {
      const supabase = createClient();

      // Step 1: Ask Claude Haiku if this is a compound query that should
      // spawn multiple root nodes (e.g. "marketing for my app" → 3 roots).
      let concepts: string[] = [query];
      try {
        const decompRes = await fetch('/api/decompose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
        if (decompRes.ok) {
          const decompData = await decompRes.json();
          if (Array.isArray(decompData.concepts) && decompData.concepts.length > 0) {
            concepts = decompData.concepts;
          }
        }
      } catch {
        // decompose failed — fall back to single concept
      }

      const isCompound = concepts.length > 1;

      // Helper: navigate to an existing node deep in the graph.
      const navigateToExisting = async (
        targetNodeId: string,
        ancestorPath: string[]
      ) => {
        set({ loading: false, loadingMessage: '' });
        if (ancestorPath.length > 0) {
          set({ path: ancestorPath });
          await get().goToLevel(ancestorPath.length - 1);
        }
        await get().diveInto(targetNodeId);
      };

      // Helper: resolve a single concept to a Wikipedia title and create a
      // root node. Returns the created GraphNode, or null if skipped/duplicate.
      const resolveAndCreate = async (
        concept: string,
        existingRoots: GraphNode[]
      ): Promise<GraphNode | null> => {
        set({ loadingMessage: `Looking up "${concept}"...` });
        const searchRes = await fetch(
          `/api/wiki/search?q=${encodeURIComponent(concept)}`
        );
        const searchData = await searchRes.json();
        const title: string = searchData.title;
        if (!title) return null;

        // Skip duplicates already in root list
        const duplicateRoot = existingRoots.find(
          (r) => r.wiki_title.toLowerCase() === title.toLowerCase()
        );
        if (duplicateRoot) {
          // For single-concept queries, navigate into the duplicate
          if (!isCompound) {
            set({ loading: false, loadingMessage: '' });
            get().diveInto(duplicateRoot.id);
          }
          return null;
        }

        // Check child nodes (rows the user has already dived into)
        const { data: existingChild } = await supabase
          .from('graph_nodes')
          .select('id, parent_id')
          .eq('user_id', userId)
          .ilike('wiki_title', title)
          .limit(1)
          .maybeSingle();

        if (existingChild) {
          if (!isCompound) {
            const ancestors = await buildAncestorPath(supabase, existingChild.id);
            await navigateToExisting(existingChild.id, ancestors);
          }
          return null;
        }

        // Placeholder position — will be redistributed below
        const { data: created, error } = await supabase
          .from('graph_nodes')
          .insert({
            user_id: userId,
            wiki_title: title,
            label: title,
            parent_id: null,
            is_root: true,
            position_x: 0,
            position_y: 0,
            position_z: 0,
          })
          .select()
          .single();
        if (error) throw error;
        return created as GraphNode;
      };

      // Step 2: Create root nodes for each concept sequentially so we can
      // show live progress messages.
      const existingRoots = get().rootNodes;
      const newlyCreated: GraphNode[] = [];

      for (const concept of concepts) {
        const node = await resolveAndCreate(concept, [
          ...existingRoots,
          ...newlyCreated,
        ]);
        if (node) newlyCreated.push(node);
        // If single concept and we navigated to an existing node, we're done
        if (!isCompound && get().path.length > 0) return;
      }

      if (newlyCreated.length === 0) return;

      // Step 3: Compute semantic layout for ALL roots using force-directed
      // placement based on Wikipedia link Jaccard similarity.
      set({ loadingMessage: 'Placing nodes...' });
      const allRoots = [...existingRoots, ...newlyCreated];
      const { nodes: laidOut, edges } = await layoutRootNodes(allRoots);

      // Persist updated positions (fire-and-forget)
      for (const u of laidOut) {
        supabase
          .from('graph_nodes')
          .update({
            position_x: u.position_x,
            position_y: u.position_y,
            position_z: u.position_z,
          })
          .eq('id', u.id)
          .then(() => {});
      }

      // Step 4: Show the new roots with semantic positions + weighted edges.
      set({ rootNodes: laidOut, currentNodes: laidOut, currentEdges: edges });
    } finally {
      set({ loading: false, loadingMessage: '' });
    }
  },

  /* ---- Dive into a node (real or virtual) ---- */
  diveInto: async (nodeId: string) => {
    const { userId } = get();
    if (!userId) return;
    if (get().diveAnimation.phase !== 'idle') return;

    const supabase = createClient();

    // If clicking a virtual child, materialise a real DB row for it first
    let realId = nodeId;
    const virt = parseVirtualId(nodeId);
    if (virt) {
      const { data: created, error } = await supabase
        .from('graph_nodes')
        .insert({
          user_id: userId,
          wiki_title: virt.title,
          label: virt.title,
          parent_id: virt.parentId,
          is_root: false,
          visited: true,
          position_x: 0,
          position_y: 0,
          position_z: 0,
        })
        .select()
        .single();
      if (error) throw error;
      realId = (created as GraphNode).id;
    }

    const node = await fetchNodeById(supabase, realId);

    // Find this node's position from the current rendered nodes so the
    // camera flies to the right place (works for both real & virtual).
    const renderedNode = get().currentNodes.find((n) => n.id === nodeId);
    const targetPos: Position3D = renderedNode
      ? {
          x: renderedNode.position_x,
          y: renderedNode.position_y,
          z: renderedNode.position_z,
        }
      : { x: node.position_x, y: node.position_y, z: node.position_z };

    // Phase 1: start preview animation
    set({
      loading: true,
      loadingMessage: `Diving into ${node.label}...`,
      diveAnimation: {
        phase: 'previewing',
        targetPos,
        previewNodes: [],
        previewEdges: [],
        startedAt: performance.now(),
      },
    });

    // Build ancestor exclude list for cycle prevention
    const currentPath = get().path;
    const ancestorTitles = await fetchAncestorTitles(supabase, currentPath);
    const excludeTitles = [...ancestorTitles, node.wiki_title];
    const excludeLower = new Set(excludeTitles.map((t) => t.toLowerCase()));

    // Fetch / curate children + summary in parallel
    const dataPromise = (async () => {
      if (!node.visited) {
        await supabase
          .from('graph_nodes')
          .update({ visited: true })
          .eq('id', realId);
        node.visited = true;
      }

      let childResult: { nodes: GraphNode[]; edges: EdgePair[] };

      // 1. Check for subtopics_json on this node (new fast path)
      const sj: SubtopicsJson | null = node.subtopics_json ?? null;
      if (sj && Array.isArray(sj.titles) && sj.titles.length > 0) {
        const visitedSet = await fetchVisitedChildTitles(
          supabase,
          realId,
          userId
        );
        childResult = buildVirtualChildren(
          realId,
          sj,
          visitedSet,
          excludeLower
        );
      } else {
        // 2. Legacy fallback: old-style child rows in the DB
        const legacy = await legacyChildrenFromRows(
          supabase,
          realId,
          userId,
          excludeLower
        );
        if (legacy && legacy.nodes.length > 0) {
          childResult = legacy;
        } else {
          // 3. Nothing cached — curate fresh via Haiku
          const curated = await curateSubtopics(
            node.wiki_title,
            excludeTitles
          );
          if (curated.titles.length > 0) {
            // Persist the curated list on the parent row (one UPDATE, not 15 INSERTs)
            await supabase
              .from('graph_nodes')
              .update({
                subtopics_json: {
                  titles: curated.titles,
                  edges: curated.edges,
                  edge_weights: curated.edge_weights,
                  relevance: curated.relevance,
                  size: curated.size,
                },
              })
              .eq('id', realId);

            childResult = buildVirtualChildren(
              realId,
              curated,
              new Set(),
              excludeLower
            );
          } else {
            childResult = { nodes: [], edges: [] };
          }
        }
      }

      // Load summary in parallel (doesn't block children)
      if (!node.summary) {
        set({ summaryStatus: 'loading' });
        const attemptSummary = async (retries = 2): Promise<void> => {
          try {
            const r = await fetch('/api/summarize', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: node.wiki_title, nodeId: realId }),
            });
            if (r.ok) {
              const d = await r.json();
              node.summary = d.summary;
              // If the wiki title was resolved from a disambiguation page,
              // update the node so the Wikipedia link points correctly.
              if (d.resolvedTitle) {
                node.wiki_title = d.resolvedTitle;
              }
              // Force sidebar re-render by touching currentParent
              const s = get();
              if (s.currentParent?.id === realId) {
                set({ currentParent: { ...node }, summaryStatus: 'loaded' });
              }
            } else {
              const body = await r.json().catch(() => ({}));
              console.error(`[summarize] ${r.status} for "${node.wiki_title}":`, body);
              if (retries > 0 && r.status >= 500) {
                await new Promise((ok) => setTimeout(ok, 1000));
                return attemptSummary(retries - 1);
              }
              set({ summaryStatus: 'error' });
            }
          } catch (err) {
            console.error(`[summarize] network error for "${node.wiki_title}":`, err);
            if (retries > 0) {
              await new Promise((ok) => setTimeout(ok, 1000));
              return attemptSummary(retries - 1);
            }
            set({ summaryStatus: 'error' });
          }
        };
        attemptSummary();
      } else {
        set({ summaryStatus: 'loaded' });
      }

      return childResult;
    })();

    const { nodes: children, edges } = await dataPromise;

    // Show preview inside the clicked node
    set((s) => ({
      diveAnimation: {
        ...s.diveAnimation,
        previewNodes: children,
        previewEdges: edges,
      },
    }));

    // Wait for minimum dive time
    const elapsed = performance.now() - get().diveAnimation.startedAt;
    if (elapsed < DIVE_DURATION) await sleep(DIVE_DURATION - elapsed);

    // Phase 2: promote inner web to outer
    const prevNodes = get().currentNodes;
    const newPath = [...get().path, realId];
    set({
      path: newPath,
      currentParent: node,
      currentNodes: children,
      currentEdges: edges,
      outerContextNodes: prevNodes,
      sidebarOpen: true,
      diveAnimation: {
        phase: 'emerging',
        targetPos: null,
        previewNodes: [],
        previewEdges: [],
        startedAt: performance.now(),
      },
    });

    await sleep(EMERGE_DURATION);
    set({
      loading: false,
      loadingMessage: '',
      diveAnimation: emptyAnimation,
    });
  },

  /* ---- Go back one level ---- */
  goBack: () => {
    const { path, userId, rootNodes } = get();
    if (path.length === 0 || !userId) return;
    const newPath = path.slice(0, -1);
    if (newPath.length === 0) {
      set({
        path: [],
        currentParent: null,
        currentNodes: rootNodes,
        currentEdges: [],
        outerContextNodes: [],
        sidebarOpen: false,
        summaryStatus: 'idle',
        diveAnimation: {
          phase: 'emerging',
          targetPos: null,
          previewNodes: [],
          previewEdges: [],
          startedAt: performance.now(),
        },
      });
      // Recompute root layout asynchronously (semantic positions + weighted edges)
      layoutRootNodes(rootNodes).then(({ nodes: laidOut, edges }) => {
        if (get().path.length === 0) {
          set({ rootNodes: laidOut, currentNodes: laidOut, currentEdges: edges });
        }
      });
      setTimeout(
        () => set({ diveAnimation: emptyAnimation }),
        EMERGE_DURATION
      );
    } else {
      get().goToLevel(newPath.length - 1, false);
    }
  },

  /* ---- Jump to a specific depth (e.g. breadcrumb click) ---- */
  goToLevel: async (depth: number, openSidebar = true) => {
    const { path, userId, rootNodes } = get();
    if (!userId) return;
    if (depth < 0) {
      set({
        path: [],
        currentParent: null,
        currentNodes: rootNodes,
        currentEdges: [],
        outerContextNodes: [],
        sidebarOpen: false,
        summaryStatus: 'idle',
        diveAnimation: {
          phase: 'emerging',
          targetPos: null,
          previewNodes: [],
          previewEdges: [],
          startedAt: performance.now(),
        },
      });
      layoutRootNodes(rootNodes).then(({ nodes: laidOut, edges }) => {
        if (get().path.length === 0) {
          set({ rootNodes: laidOut, currentNodes: laidOut, currentEdges: edges });
        }
      });
      setTimeout(
        () => set({ diveAnimation: emptyAnimation }),
        EMERGE_DURATION
      );
      return;
    }
    set({ loading: true, loadingMessage: 'Loading...' });
    try {
      const supabase = createClient();
      const newPath = path.slice(0, depth + 1);
      const targetId = newPath[newPath.length - 1];
      const parent = await fetchNodeById(supabase, targetId);
      const ancestorTitles = await fetchAncestorTitles(
        supabase,
        newPath.slice(0, -1)
      );
      const excludeLower = new Set(
        [...ancestorTitles, parent.wiki_title].map((t) => t.toLowerCase())
      );

      let childResult: { nodes: GraphNode[]; edges: EdgePair[] };

      const sj: SubtopicsJson | null = parent.subtopics_json ?? null;
      if (sj && Array.isArray(sj.titles) && sj.titles.length > 0) {
        const visitedSet = await fetchVisitedChildTitles(
          supabase,
          targetId,
          userId
        );
        childResult = buildVirtualChildren(
          targetId,
          sj,
          visitedSet,
          excludeLower
        );
      } else {
        const legacy = await legacyChildrenFromRows(
          supabase,
          targetId,
          userId,
          excludeLower
        );
        childResult = legacy ?? { nodes: [], edges: [] };
      }

      set({
        path: newPath,
        currentParent: parent,
        currentNodes: childResult.nodes,
        currentEdges: childResult.edges,
        outerContextNodes: [],
        sidebarOpen: openSidebar,
        summaryStatus: parent.summary ? 'loaded' : 'idle',
        diveAnimation: {
          phase: 'emerging',
          targetPos: null,
          previewNodes: [],
          previewEdges: [],
          startedAt: performance.now(),
        },
      });
      setTimeout(
        () => set({ diveAnimation: emptyAnimation }),
        EMERGE_DURATION
      );
    } finally {
      set({ loading: false, loadingMessage: '' });
    }
  },

  /* ---- Delete everything and reload ---- */
  reset: async () => {
    const { userId } = get();
    if (!userId) return;
    const supabase = createClient();
    await supabase.from('graph_nodes').delete().eq('user_id', userId);
    set({
      path: [],
      rootNodes: [],
      currentNodes: [],
      currentEdges: [],
      currentParent: null,
      outerContextNodes: [],
      sidebarOpen: false,
      summaryStatus: 'idle',
      diveAnimation: emptyAnimation,
    });
  },

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));