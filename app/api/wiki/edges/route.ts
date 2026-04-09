import { NextResponse } from 'next/server';
import { getWikiLinks } from '@/lib/wikipedia';

/**
 * POST /api/wiki/edges
 * Body: { titles: string[] }
 * Returns: { edges: [number, number][] }
 *
 * For each pair (i, j) of titles, returns an edge if either article
 * links to the other on Wikipedia. This produces a real web of relationships
 * between sibling nodes.
 */
export async function POST(req: Request) {
  try {
    const { titles } = await req.json();
    if (!Array.isArray(titles) || titles.length < 2) {
      return NextResponse.json({ edges: [] });
    }

    // Cap fetches — 12 parallel is enough for our 15-node default.
    const list: string[] = titles.slice(0, 12);

    const linksets = await Promise.all(
      list.map((t) =>
        getWikiLinks(t)
          .then((ls) => new Set(ls.map((s) => s.toLowerCase())))
          .catch(() => new Set<string>())
      )
    );

    const edges: [number, number][] = [];
    for (let i = 0; i < list.length; i++) {
      const lowerI = list[i].toLowerCase();
      for (let j = i + 1; j < list.length; j++) {
        const lowerJ = list[j].toLowerCase();
        if (linksets[i].has(lowerJ) || linksets[j].has(lowerI)) {
          edges.push([i, j]);
        }
      }
    }

    return NextResponse.json(
      { edges },
      { headers: { 'Cache-Control': 'public, s-maxage=3600' } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Failed' }, { status: 500 });
  }
}
