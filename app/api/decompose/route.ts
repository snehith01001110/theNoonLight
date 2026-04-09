import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are a knowledge graph assistant. Your job is to decide whether a user's query maps to a single Wikipedia topic, or whether it's a compound/intent-driven query that should be split into 2–4 distinct Wikipedia-searchable concepts.

## Rules

- If the query is a clear, direct Wikipedia topic (e.g. "Quantum Computing", "The Roman Empire", "Python"), return it as a single concept — do NOT split it.
- If the query is compound, intent-driven, or describes a goal (e.g. "marketing for my app", "how the brain learns", "starting a business"), split it into 2–4 concrete Wikipedia concepts that best cover the space.
- Each concept you return MUST be a real, searchable Wikipedia article title or a phrase very likely to match one.
- Prefer specific, well-defined concepts over vague ones (e.g. "App Store Optimization" over "marketing").
- Return 2–4 concepts for compound queries. Never more than 4. Never fewer than 2 for a compound query.
- For simple, single-topic queries, return exactly 1 concept.

## Output

Respond with STRICT JSON only. No markdown. No prose. No code fences.
Shape: {"concepts": ["Concept A", "Concept B"]}`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const query: string = body.query?.trim();
    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: 'user', content: `User query: "${query}"` }],
    });

    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    let parsed: { concepts?: unknown } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      // Fallback: treat original query as single concept
      return NextResponse.json({ concepts: [query] });
    }

    const concepts = Array.isArray(parsed.concepts)
      ? (parsed.concepts as unknown[])
          .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
          .slice(0, 4)
      : [query];

    return NextResponse.json({ concepts: concepts.length > 0 ? concepts : [query] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Failed to decompose query' },
      { status: 500 }
    );
  }
}
