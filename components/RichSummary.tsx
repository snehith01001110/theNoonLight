'use client';

/**
 * Minimal markdown renderer — handles ## headers and - bullets.
 * Good enough for the structured summaries we generate.
 */
export default function RichSummary({ markdown }: { markdown: string }) {
  if (!markdown) {
    return <div className="text-slate-500 text-sm italic">No summary yet.</div>;
  }

  const lines = markdown.split('\n');
  const elements: JSX.Element[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = (key: number) => {
    if (bulletBuffer.length === 0) return;
    elements.push(
      <ul key={`ul-${key}`} className="list-disc pl-5 space-y-1 my-2 text-slate-200 max-md:list-none max-md:pl-3 max-md:border-l-2 max-md:border-emerald-500/30 max-md:space-y-1.5">
        {bulletBuffer.map((b, i) => (
          <li key={i} className="text-sm max-md:text-xs leading-relaxed">
            {b}
          </li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      flushBullets(i);
      return;
    }
    if (line.startsWith('## ')) {
      flushBullets(i);
      elements.push(
        <h3
          key={`h-${i}`}
          className="text-sky-300 text-xs uppercase tracking-widest font-medium mt-4 mb-1 max-md:bg-sky-500/10 max-md:inline-block max-md:px-2 max-md:py-0.5 max-md:rounded"
        >
          {line.replace(/^##\s*/, '')}
        </h3>
      );
    } else if (line.startsWith('# ')) {
      flushBullets(i);
      elements.push(
        <h2 key={`h-${i}`} className="text-emerald-400 text-lg max-md:text-base font-light mt-4 mb-2">
          {line.replace(/^#\s*/, '')}
        </h2>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      bulletBuffer.push(line.replace(/^[-*]\s*/, ''));
    } else {
      flushBullets(i);
      elements.push(
        <p key={`p-${i}`} className="text-slate-200 text-sm max-md:text-xs leading-relaxed my-1">
          {line}
        </p>
      );
    }
  });
  flushBullets(lines.length);

  return <div>{elements}</div>;
}
