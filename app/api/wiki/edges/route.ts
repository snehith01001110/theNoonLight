import { NextResponse } from 'next/server';
import { getWikiLinks } from '@/lib/wikipedia';

/**
 * POST /api/wiki/edges
 * Body: { titles: string[] }
 * Returns: { edges: [number, number, number][], linkCounts: number[] }
 *
 * For each pair (i, j), computes Jaccard similarity over their Wikipedia
 * outgoing link sets: |A∩B| / |A∪B|. This produces weighted edges that
 * reflect semantic relatedness between sibling/root nodes.
 *
 * linkCounts[i] = number of outgoing links for article i (proxy for topic breadth).
 */
export async function POST(req: Request) {
  try {
    const { titles } = await req.json();
    if (!Array.isArray(titles) || titles.length < 2) {
      return NextResponse.json({ edges: [], linkCounts: [] });
    }

    // Cap fetches — 20 parallel covers root-level graphs.
    const list: string[] = titles.slice(0, 20);

    const linksets = await Promise.all(
      list.map((t) =>
        getWikiLinks(t)
          .then((ls) => new Set(ls.map((s) => s.toLowerCase())))
          .catch(() => new Set<string>())
      )
    );

    const linkCounts = linksets.map((s) => s.size);

    const edges: [number, number, number][] = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const setI = linksets[i];
        const setJ = linksets[j];

        // Jaccard similarity: |intersection| / |union|
        let intersection = 0;
        const smaller = setI.size <= setJ.size ? setI : setJ;
        const larger = setI.size <= setJ.size ? setJ : setI;
        for (const link of smaller) {
          if (larger.has(link)) intersection++;
        }
        const union = setI.size + setJ.size - intersection;
        const jaccard = union > 0 ? intersection / union : 0;

        if (jaccard > 0.01) {
          edges.push([i, j, Math.round(jaccard * 1000) / 1000]);
        }
      }
    }

    return NextResponse.json(
      { edges, linkCounts },
      { headers: { 'Cache-Control': 'public, s-maxage=3600' } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Failed' }, { status: 500 });
  }
}
