import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  try {
    const { wikiTitle, summary, messages } = await req.json();
    if (!wikiTitle || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 });
    }

    const system = `You are a friendly, expert tutor helping the user learn about "${wikiTitle}". You have access to this summary as background context:\n\n${
      summary ?? '(no summary available)'
    }\n\nAnswer questions clearly and concisely. Cite specific concepts. If asked something tangential, gently redirect to the topic. Keep responses focused and under 200 words unless detail is requested.`;

    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system,
      messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message ?? 'Failed' }), { status: 500 });
  }
}
