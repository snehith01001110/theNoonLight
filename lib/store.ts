'use client';

import { create } from 'zustand';
import type { GraphNode, Position3D, EdgePair } from './types';
import { createClient } from './supabase-browser';
import { distributeOnSphere } from './wikipedia';
import { forceLayout, ForceEdge } from './force-layout';

export type DivePhase = 'idle' | 'previewing' | 'emerging';

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
  diveAnimation: DiveAnimation;

  setUserId: (id: string | null) => void;
  loadInitial: () => Promise<void>;
  startTopic: (query: string) => Promise<void>;
  diveInto: (nodeId: string) => Promise<void>;
  goBack: () => void;
  goToLevel: (depth: number) => Promise<void>;
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
  exclude: string[]
): Promise<SubtopicsJson> {
  try {
    const res = await fetch('/api/subtopics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, exclude }),
    });
    if (!res.ok) return { titles: [], edges: [] };
    const data = await res.json();
    return {
      titles: Array.isArray(data.subtopics) ? data.subtopics : [],
      edges: Array.isArray(data.edges) ? data.edges : [],
      edge_weights: Array.isArray(data.edge_weights) ? data.edge_weights : undefined,
      relevance: Array.isArray(data.relevance) ? data.relevance : undefined,
      size: Array.isArray(data.size) ? data.size : undefined,
    };
  } catch {
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

/** Compute edges between an array of nodes via wiki link intersection. */
async function computeNodeEdges(nodes: GraphNode[]): Promise<EdgePair[]> {
  if (nodes.length < 2) return [];
  try {
    const res = await fetch('/api/wiki/edges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titles: nodes.map((n) => n.wiki_title) }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.edges ?? []) as [number, number][])
      .filter(([i, j]) => nodes[i] && nodes[j])
      .map(([i, j]) => [nodes[i].id, nodes[j].id] as EdgePair);
  } catch {
    return [];
  }
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

  // Compute edges via wiki link intersection
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
        edges = ((d.edges ?? []) as [number, number][])
          .filter(([i, j]) => rows[i] && rows[j])
          .map(([i, j]) => [rows[i].id, rows[j].id] as EdgePair);
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
      const rootEdges = await computeNodeEdges(roots);
      set({
        rootNodes: roots,
        currentNodes: roots,
        currentEdges: rootEdges,
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
    set({ loading: true, loadingMessage: `Exploring ${query}...` });
    try {
      const supabase = createClient();
      const searchRes = await fetch(
        `/api/wiki/search?q=${encodeURIComponent(query)}`
      );
      const searchData = await searchRes.json();
      const title: string = searchData.title;
      if (!title) throw new Error('No Wikipedia article found');

      const existingRoots = get().rootNodes;

      // Helper: navigate to a node deep in the graph with the correct
      // ancestor path (so breadcrumb shows Home > Human > Cognition, and
      // Back goes to the parent level, not Home).
      const navigateToExisting = async (
        targetNodeId: string,
        ancestorPath: string[]
      ) => {
        set({ loading: false, loadingMessage: '' });
        if (ancestorPath.length > 0) {
          // First navigate to the parent level so currentNodes/currentParent
          // are set correctly, then dive into the target.
          const parentDepth = ancestorPath.length - 1;
          // Temporarily set path so goToLevel can slice it
          set({ path: ancestorPath });
          await get().goToLevel(parentDepth);
        }
        // Now dive into the target — this appends it to the path
        await get().diveInto(targetNodeId);
      };

      // Don't add a duplicate — check if this topic exists ANYWHERE in the
      // user's graph. If found, navigate with full ancestor path.
      const duplicateRoot = existingRoots.find(
        (r) => r.wiki_title.toLowerCase() === title.toLowerCase()
      );
      if (duplicateRoot) {
        set({ loading: false, loadingMessage: '' });
        get().diveInto(duplicateRoot.id);
        return;
      }

      // Check child nodes (rows created when the user dived into them)
      const { data: existingChild } = await supabase
        .from('graph_nodes')
        .select('id, parent_id')
        .eq('user_id', userId)
        .ilike('wiki_title', title)
        .limit(1)
        .maybeSingle();

      if (existingChild) {
        const ancestors = await buildAncestorPath(supabase, existingChild.id);
        await navigateToExisting(existingChild.id, ancestors);
        return;
      }

      // Check virtual children: topic might be listed in a parent's
      // subtopics_json even though the user hasn't clicked into it yet.
      const titleLower = title.toLowerCase();
      const { data: parentWithChild } = await supabase
        .from('graph_nodes')
        .select('id, subtopics_json')
        .eq('user_id', userId)
        .not('subtopics_json', 'is', null)
        .limit(50);

      if (parentWithChild) {
        for (const row of parentWithChild) {
          const sj = row.subtopics_json as { titles?: string[] } | null;
          if (!sj?.titles) continue;
          const match = sj.titles.find(
            (t: string) => t.toLowerCase() === titleLower
          );
          if (match) {
            // Found as a virtual child — navigate with proper path
            const virtualId = `v|${row.id}|${match}`;
            // The parent of this virtual node is row.id — build path to it
            const ancestors = await buildAncestorPath(supabase, row.id);
            const fullAncestorPath = [...ancestors, row.id];
            await navigateToExisting(virtualId, fullAncestorPath);
            return;
          }
        }
      }

      const totalCount = existingRoots.length + 1;
      const positions = distributeOnSphere(totalCount, 5);

      const { data: created, error } = await supabase
        .from('graph_nodes')
        .insert({
          user_id: userId,
          wiki_title: title,
          label: title,
          parent_id: null,
          is_root: true,
          position_x: positions[totalCount - 1].x,
          position_y: positions[totalCount - 1].y,
          position_z: positions[totalCount - 1].z,
        })
        .select()
        .single();
      if (error) throw error;

      // Redistribute ALL root positions so they stay evenly spread
      const newRoots = [...existingRoots, created as GraphNode];
      const freshPositions = distributeOnSphere(newRoots.length, 5);
      const updates = newRoots.map((root, i) => ({
        ...root,
        position_x: freshPositions[i].x,
        position_y: freshPositions[i].y,
        position_z: freshPositions[i].z,
      }));
      // Persist updated positions (fire-and-forget)
      for (const u of updates) {
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
      // Compute edges between all roots (fire-and-forget visual update)
      set({ rootNodes: updates, currentNodes: updates, currentEdges: [] });
      computeNodeEdges(updates).then((edges) => {
        // Only apply if we're still at root level
        if (get().path.length === 0) {
          set({ currentEdges: edges });
        }
      });
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
        fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: node.wiki_title, nodeId: realId }),
        })
          .then(async (r) => {
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
                set({ currentParent: { ...node } });
              }
            }
          })
          .catch(() => {});
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
        diveAnimation: {
          phase: 'emerging',
          targetPos: null,
          previewNodes: [],
          previewEdges: [],
          startedAt: performance.now(),
        },
      });
      // Recompute root edges asynchronously
      computeNodeEdges(rootNodes).then((edges) => {
        if (get().path.length === 0) set({ currentEdges: edges });
      });
      setTimeout(
        () => set({ diveAnimation: emptyAnimation }),
        EMERGE_DURATION
      );
    } else {
      get().goToLevel(newPath.length - 1);
    }
  },

  /* ---- Jump to a specific depth (e.g. breadcrumb click) ---- */
  goToLevel: async (depth: number) => {
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
        diveAnimation: {
          phase: 'emerging',
          targetPos: null,
          previewNodes: [],
          previewEdges: [],
          startedAt: performance.now(),
        },
      });
      computeNodeEdges(rootNodes).then((edges) => {
        if (get().path.length === 0) set({ currentEdges: edges });
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
        sidebarOpen: true,
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

  /* ---- Reset everything ---- */
  reset: async () => {
    const { userId } = get();
    if (!userId) return;
    set({ loading: true, loadingMessage: 'Resetting...' });
    try {
      const supabase = createClient();
      await supabase.from('graph_nodes').delete().eq('user_id', userId);
      set({
        rootNodes: [],
        currentNodes: [],
        currentEdges: [],
        currentParent: null,
        outerContextNodes: [],
        path: [],
        sidebarOpen: false,
      });
    } finally {
      set({ loading: false, loadingMessage: '' });
    }
  },

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
