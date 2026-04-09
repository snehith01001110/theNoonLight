import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getWikiSummary } from '@/lib/wikipedia';
import { createClient } from '@/lib/supabase-server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You create concise learning summaries from Wikipedia content. Return markdown with:
## What is it
1-2 sentences.
## Why it matters
2-3 bullet points (each 1 sentence).
## Key concepts
3-4 bullet points.
Keep total under 120 words. Be direct, no filler. Do not use bold (**) — plain text only.`;

export async function POST(req: Request) {
  try {
    const { title, nodeId } = await req.json();
    if (!title) return NextResponse.json({ error: 'Missing title' }, { status: 400 });

    const supabase = createClient();

    // 1. Check per-user cache on the graph_node row
    if (nodeId) {
      const { data: existing } = await supabase
        .from('graph_nodes')
        .select('summary')
        .eq('id', nodeId)
        .single();
      if (existing?.summary) {
        return NextResponse.json({ summary: existing.summary, cached: true });
      }
    }

    // 2. Check the shared summaries table (public, cross-user)
    const { data: shared } = await supabase
      .from('summaries')
      .select('summary')
      .eq('wiki_title', title)
      .maybeSingle();

    if (shared?.summary) {
      // Cache onto graph_node too
      if (nodeId) {
        await supabase
          .from('graph_nodes')
          .update({ summary: shared.summary })
          .eq('id', nodeId);
      }
      return NextResponse.json({
        summary: shared.summary,
        cached: true,
        source: 'shared',
      });
    }

    // 3. Fetch Wikipedia extract and ask Claude
    const wiki = await getWikiSummary(title);
    if (!wiki || !wiki.extract) {
      return NextResponse.json({ error: 'No extract available' }, { status: 404 });
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Summarize for a curious learner:\n\n${wiki.extract}` },
      ],
    });

    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
      .trim();

    // 4. Write to both caches: shared + per-user graph_node
    await supabase
      .from('summaries')
      .upsert({ wiki_title: title, summary: text, updated_at: new Date().toISOString() });

    if (nodeId) {
      await supabase.from('graph_nodes').update({ summary: text }).eq('id', nodeId);
    }

    return NextResponse.json({ summary: text, cached: false, source: 'claude' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Failed' }, { status: 500 });
  }
}
