import { NextResponse } from 'next/server';
import { getWikiLinks, getIntroLinks, combineLinks } from '@/lib/wikipedia';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get('title');
  const limit = parseInt(searchParams.get('limit') ?? '15', 10);
  if (!title) return NextResponse.json({ error: 'Missing title' }, { status: 400 });
  try {
    // Fetch intro + all links in parallel. Intro links (from the lead section)
    // are the most topically relevant.
    const [introLinks, allLinks] = await Promise.all([
      getIntroLinks(title),
      getWikiLinks(title),
    ]);
    const combined = combineLinks(introLinks, allLinks, limit);
    return NextResponse.json(
      { links: combined },
      { headers: { 'Cache-Control': 'public, s-maxage=3600' } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Failed' }, { status: 500 });
  }
}
