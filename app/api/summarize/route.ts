import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getWikiSummary, resolveWikiTitle } from '@/lib/wikipedia';
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

    // 0. Resolve the actual Wikipedia title first. This is a lightweight call
    //    that catches disambiguation pages early so we don't cache wrong summaries.
    let resolvedTitle: string;
    try {
      resolvedTitle = await resolveWikiTitle(title);
    } catch {
      resolvedTitle = title; // fallback to original on any error
    }
    const titleChanged = resolvedTitle !== title;

    // 1. Check per-user cache on the graph_node row
    if (nodeId) {
      const { data: existing } = await supabase
        .from('graph_nodes')
        .select('summary')
        .eq('id', nodeId)
        .single();
      if (existing?.summary) {
        return NextResponse.json({
          summary: existing.summary,
          cached: true,
          resolvedTitle: titleChanged ? resolvedTitle : undefined,
        });
      }
    }

    // 2. Check the shared summaries table under the RESOLVED title
    const { data: shared } = await supabase
      .from('summaries')
      .select('summary')
      .eq('wiki_title', resolvedTitle)
      .maybeSingle();

    if (shared?.summary) {
      // Cache onto graph_node too
      if (nodeId) {
        const updatePayload: Record<string, string> = { summary: shared.summary };
        if (titleChanged) updatePayload.wiki_title = resolvedTitle;
        await supabase.from('graph_nodes').update(updatePayload).eq('id', nodeId);
      }
      return NextResponse.json({
        summary: shared.summary,
        cached: true,
        source: 'shared',
        resolvedTitle: titleChanged ? resolvedTitle : undefined,
      });
    }

    // 3. Fetch Wikipedia extract and ask Claude
    const wiki = await getWikiSummary(resolvedTitle);
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

    // 4. Write to both caches under the resolved title
    await supabase
      .from('summaries')
      .upsert({ wiki_title: resolvedTitle, summary: text, updated_at: new Date().toISOString() });

    if (nodeId) {
      const updatePayload: Record<string, string> = { summary: text };
      if (titleChanged) updatePayload.wiki_title = resolvedTitle;
      await supabase.from('graph_nodes').update(updatePayload).eq('id', nodeId);
    }

    return NextResponse.json({
      summary: text,
      cached: false,
      source: 'claude',
      resolvedTitle: titleChanged ? resolvedTitle : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Failed' }, { status: 500 });
  }
}
