'use client';

/**
 * Styled markdown renderer for structured topic summaries.
 * Handles ## section headers, - bullets, and plain paragraphs
 * with polished card-like visual treatment.
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
      <ul key={`ul-${key}`} className="space-y-2 my-2.5 pl-1">
        {bulletBuffer.map((b, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm max-md:text-xs leading-relaxed text-slate-300">
            <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-sky-400/60 shrink-0" />
            <span>{b}</span>
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
        <div
          key={`h-${i}`}
          className="flex items-center gap-2.5 mt-5 mb-2 first:mt-0"
        >
          <div className="w-0.5 h-4 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-400/20" />
          <h3 className="text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-400">
            {line.replace(/^##\s*/, '')}
          </h3>
        </div>
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
        <p key={`p-${i}`} className="text-slate-300 text-sm max-md:text-xs leading-[1.7] my-1.5">
          {line}
        </p>
      );
    }
  });
  flushBullets(lines.length);

  return <div>{elements}</div>;
}
