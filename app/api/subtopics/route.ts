import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  getIntroLinks,
  getWikiLinks,
  combineLinks,
  getWikiSummary,
} from '@/lib/wikipedia';
import { enrichSubtopicsWithWikidata, boostEdgeWeightsWithEdges, buildRelationshipMetadataWithEdges } from '@/lib/wikidata-enrich';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are an expert knowledge architect building an interactive knowledge graph.

A learner clicked on a topic and you must choose the BEST subtopics from a candidate pool (pulled from Wikipedia links on that topic's page).

## Selection rules (STRICT)
- Pick 12–15 subtopics. Fewer only if the pool is genuinely thin.
- Think like a textbook author: what chapters would a definitive book on this topic contain?
- TIER 1 (must include): Core concepts that DEFINE the topic. A learner cannot understand the topic without these.
- TIER 2 (should include): Key prerequisites, essential techniques, major subfields, and closely related domains.
- TIER 3 (fill remaining slots): Notable applications, important related concepts, broader context.
- HARD AVOID: specific people/biographies, specific years/dates, awards/prizes, journals/publications, organizations/institutions, geographic places (unless the topic IS geography), meta-articles (lists, outlines, indices), anything that is trivia rather than knowledge structure.
- NEVER pick anything in "exclude" (ancestor topics — creates loops).
- NEVER pick the parent topic itself.
- ONLY pick titles that appear VERBATIM in the candidate pool.

## Output fields

1. "subtopics": your picked titles (verbatim from pool).

2. "edges": pairs [i, j] of subtopics that are DIRECTLY and STRONGLY related to each other in the context of learning this topic. Rules:
   - Every subtopic must have at least 1 edge (no orphans).
   - Aim for 1.5–2.5 edges per node on average — enough connectivity to see structure, not a hairball.
   - Only connect topics that a learner would naturally study together or that share conceptual overlap.
   - Also output "edge_weights": a parallel array of floats 0.0–1.0 indicating HOW related each edge pair is (1.0 = deeply intertwined, 0.3 = loosely related). This drives visual distance — strongly related nodes appear closer together.

3. "relevance": per-subtopic score 0.0–1.0. How ESSENTIAL is this subtopic for understanding the parent?
   - 0.9–1.0: Cannot understand the parent without this. Core definition.
   - 0.6–0.8: Important prerequisite or major subfield.
   - 0.3–0.5: Useful context, notable application, or adjacent domain.
   - 0.0–0.2: Only tangentially related.
   Use the FULL range. Not everything is 0.7. Be opinionated.

4. "size": per-subtopic score 0.0–1.0. How BROAD is this subtopic as an independent field?
   - 0.9–1.0: Massive field (Mathematics, Physics, Computer Science, Biology).
   - 0.6–0.8: Substantial subfield (Machine Learning, Organic Chemistry, Data Structures).
   - 0.3–0.5: Focused topic with some depth (Binary Search Tree, Gradient Descent).
   - 0.0–0.2: Narrow concept (Big O Notation, Sigmoid Function).
   This determines the VISUAL SIZE of each node. Be calibrated — most subtopics of a topic should NOT all be the same size.

Respond with STRICT JSON only. No markdown. No prose. No code fences.
Shape:
{"subtopics": ["Title A", ...], "edges": [[0,1],[0,3]], "edge_weights": [0.8, 0.5], "relevance": [0.9, 0.6, ...], "size": [0.7, 0.3, ...]}

All arrays (subtopics, relevance, size) must be the same length. edge_weights must be the same length as edges.`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const topic: string = body.topic;
    const exclude: string[] = Array.isArray(body.exclude) ? body.exclude : [];
    if (!topic) {
      return NextResponse.json({ error: 'Missing topic' }, { status: 400 });
    }

    // Gather a broad candidate pool
    const [introLinks, allLinks, summary] = await Promise.all([
      getIntroLinks(topic).catch(() => [] as string[]),
      getWikiLinks(topic).catch(() => [] as string[]),
      getWikiSummary(topic).catch(() => null),
    ]);

    const excludeLower = new Set(
      [...exclude, topic].map((s) => s.toLowerCase())
    );

    const pool = combineLinks(introLinks, allLinks, 60).filter(
      (t) => !excludeLower.has(t.toLowerCase())
    );

    if (pool.length === 0) {
      return NextResponse.json({ subtopics: [], edges: [] });
    }

    const extract = (summary?.extract || '').slice(0, 450);
    const excludeLine =
      exclude.length > 0
        ? exclude.join(', ')
        : '(none — this is a top-level topic)';

    const userMsg = `Topic: ${topic}
${extract ? `\nShort description: ${extract}\n` : ''}
Ancestor path already explored (EXCLUDE these — picking any creates a loop):
${excludeLine}

Candidate subtopics (numbered, pulled from Wikipedia links on the topic's page):
${pool.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Pick 12–15 subtopics most useful for learning "${topic}" and return the JSON.`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    });

    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim();

    // Strip any accidental code fences
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    let parsed: { subtopics?: unknown; edges?: unknown; edge_weights?: unknown; relevance?: unknown; size?: unknown } = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: use raw pool head, no edges, uniform scores
      const fallbackSubs = pool.slice(0, 12);
      return NextResponse.json({
        subtopics: fallbackSubs,
        edges: [],
        relevance: fallbackSubs.map(() => 0.5),
        size: fallbackSubs.map(() => 0.5),
        fallback: true,
      });
    }

    const poolLowerToOriginal = new Map(
      pool.map((p) => [p.toLowerCase(), p] as const)
    );

    const rawSubs = Array.isArray(parsed.subtopics) ? parsed.subtopics : [];
    const rawRelevance = Array.isArray(parsed.relevance) ? parsed.relevance : [];
    const rawSize = Array.isArray(parsed.size) ? parsed.size : [];

    const subtopics: string[] = [];
    const relevance: number[] = [];
    const size: number[] = [];
    const seen = new Set<string>();
    const originalIndices: number[] = []; // tracks original index before filtering

    for (let origIdx = 0; origIdx < rawSubs.length; origIdx++) {
      const item = rawSubs[origIdx];
      if (typeof item !== 'string') continue;
      const lower = item.toLowerCase();
      if (excludeLower.has(lower)) continue;
      if (seen.has(lower)) continue;
      // Accept exact pool match; otherwise map to canonical casing from pool
      const canonical = poolLowerToOriginal.get(lower) ?? item;
      // Reject if not in pool at all — prevents the model from hallucinating
      if (!poolLowerToOriginal.has(lower)) continue;
      seen.add(lower);
      subtopics.push(canonical);
      originalIndices.push(origIdx);
      // Clamp scores to [0,1], default to 0.5 if missing/invalid
      const rel = typeof rawRelevance[origIdx] === 'number'
        ? Math.max(0, Math.min(1, rawRelevance[origIdx]))
        : 0.5;
      const sz = typeof rawSize[origIdx] === 'number'
        ? Math.max(0, Math.min(1, rawSize[origIdx]))
        : 0.5;
      relevance.push(rel);
      size.push(sz);
      if (subtopics.length >= 15) break;
    }

    // Last-resort backfill if the model under-delivered
    if (subtopics.length < 8) {
      for (const p of pool) {
        if (subtopics.length >= 12) break;
        const l = p.toLowerCase();
        if (seen.has(l)) continue;
        seen.add(l);
        subtopics.push(p);
        relevance.push(0.4);
        size.push(0.4);
      }
    }

    // Remap edges from original indices to filtered indices
    const origToFiltered = new Map<number, number>();
    for (let fi = 0; fi < originalIndices.length; fi++) {
      origToFiltered.set(originalIndices[fi], fi);
    }

    const rawEdges = Array.isArray(parsed.edges) ? parsed.edges : [];
    const rawEdgeWeights = Array.isArray(parsed.edge_weights) ? parsed.edge_weights : [];
    const edgeKey = new Set<string>();
    const edges: [number, number][] = [];
    let edgeWeights: number[] = [];
    for (let ei = 0; ei < rawEdges.length; ei++) {
      const e = rawEdges[ei];
      if (!Array.isArray(e) || e.length !== 2) continue;
      const oa = Number(e[0]);
      const ob = Number(e[1]);
      if (!Number.isInteger(oa) || !Number.isInteger(ob)) continue;
      if (oa === ob) continue;
      const a = origToFiltered.get(oa) ?? oa;
      const b = origToFiltered.get(ob) ?? ob;
      if (a < 0 || b < 0) continue;
      if (a >= subtopics.length || b >= subtopics.length) continue;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const k = `${lo}-${hi}`;
      if (edgeKey.has(k)) continue;
      edgeKey.add(k);
      edges.push([lo, hi]);
      // Extract weight for this edge, default to 0.5
      const w = typeof rawEdgeWeights[ei] === 'number'
        ? Math.max(0, Math.min(1, rawEdgeWeights[ei]))
        : 0.5;
      edgeWeights.push(w);
    }

    // Attempt Wikidata enrichment (non-blocking with graceful fallback)
    let relationshipTypes: any[] = [];
    let wikidataEnriched = false;
    try {
      const enrichment = await Promise.race([
        enrichSubtopicsWithWikidata(subtopics, topic, edgeWeights),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
      ]);

      if (enrichment && enrichment.relationship_types && enrichment.relationship_types.length > 0) {
        edgeWeights = enrichment.edge_weights || edgeWeights;
        relationshipTypes = enrichment.relationship_types;
        wikidataEnriched = true;
      }
    } catch (err) {
      // Silently ignore Wikidata enrichment failures — use Claude-only results
      console.warn('[api/subtopics] Wikidata enrichment failed or timed out:', (err as Error)?.message);
    }

    const response: any = { subtopics, edges, edge_weights: edgeWeights, relevance, size };
    if (relationshipTypes.length > 0) {
      response.relationship_types = relationshipTypes;
    }
    if (wikidataEnriched) {
      response.wikidata_enriched = true;
    }

    return NextResponse.json(response);
  } catch (e: any) {
    console.error('[api/subtopics] error:', e?.status ?? '', e?.message ?? e);
    return NextResponse.json(
      { error: e?.message || 'Failed to curate subtopics', code: e?.status ?? 'UNKNOWN' },
      { status: e?.status === 429 ? 429 : 500 }
    );
  }
}
