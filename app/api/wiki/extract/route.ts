import { NextResponse } from 'next/server';
import { getWikiSummary } from '@/lib/wikipedia';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get('title');
  if (!title) return NextResponse.json({ error: 'Missing title' }, { status: 400 });
  try {
    const data = await getWikiSummary(title);
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=3600' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Failed' }, { status: 500 });
  }
}
