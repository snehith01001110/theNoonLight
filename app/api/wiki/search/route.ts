import { NextResponse } from 'next/server';
import { searchWikipedia } from '@/lib/wikipedia';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  if (!q) return NextResponse.json({ error: 'Missing q' }, { status: 400 });
  try {
    const title = await searchWikipedia(q);
    if (!title) return NextResponse.json({ error: 'No results' }, { status: 404 });
    return NextResponse.json(
      { title },
      { headers: { 'Cache-Control': 'public, s-maxage=3600' } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Failed' }, { status: 500 });
  }
}
