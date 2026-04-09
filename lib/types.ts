export interface GraphNode {
  id: string;
  user_id: string;
  wiki_title: string;
  label: string;
  summary: string | null;
  parent_id: string | null;
  position_x: number;
  position_y: number;
  position_z: number;
  is_root: boolean;
  visited: boolean;
  created_at: string;
  subtopics_json?: {
    titles: string[];
    edges: [number, number][];
    /** Per-edge relationship weight (0–1, higher = more related = placed closer) */
    edge_weights?: number[];
    /** Per-subtopic relevance to parent (0–1, higher = more central = placed closer) */
    relevance?: number[];
    /** Per-subtopic breadth/size as a knowledge field (0–1, drives sphere radius) */
    size?: number[];
  } | null;
  /** Visual size scale for this node's sphere (0–1, derived from topic breadth) */
  topicSize?: number;
}

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

// An edge between two sibling nodes, identified by their node IDs.
// Optional third element is the edge weight (0–1, default 0.5).
export type EdgePair = [string, string] | [string, string, number];

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface WikiSearchResult {
  title: string;
  snippet: string;
}

export interface WikiLinkResult {
  title: string;
}
