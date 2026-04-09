const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_REST = 'https://en.wikipedia.org/api/rest_v1';

const SKIP_PATTERNS = [
  /^list of/i,
  /\(disambiguation\)/i,
  /^index of/i,
  /^outline of/i,
  /^category:/i,
  /^file:/i,
  /^template:/i,
  /^wikipedia:/i,
  /^help:/i,
  /^portal:/i,
  /^talk:/i,
  /^user:/i,
  /^draft:/i,
  /^mos:/i,
  /^isbn\b/i,
  /^doi\b/i,
  /^pmid\b/i,
  /^issn\b/i,
  /^arxiv/i,
  /^bibcode/i,
  /^oclc/i,
  /^jstor/i,
];

export function isJunkLink(title: string): boolean {
  if (!title || title.length < 2) return true;
  if (/^\d+$/.test(title)) return true; // pure numbers
  return SKIP_PATTERNS.some((p) => p.test(title));
}

export async function searchWikipedia(query: string): Promise<string | null> {
  const url = `${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(
    query
  )}&format=json&origin=*&srlimit=1`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  const data = await res.json();
  const first = data?.query?.search?.[0];
  return first?.title ?? null;
}

export async function getWikiLinks(title: string): Promise<string[]> {
  const url = `${WIKI_API}?action=query&titles=${encodeURIComponent(
    title
  )}&prop=links&pllimit=500&plnamespace=0&format=json&origin=*`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const data = await res.json();
  const pages = data?.query?.pages ?? {};
  const firstPage = Object.values(pages)[0] as any;
  const links: { title: string }[] = firstPage?.links ?? [];
  return links.map((l) => l.title).filter((t) => !isJunkLink(t));
}

/**
 * Fetch links that appear in the article's intro/lead section by parsing
 * revision wikitext for section 0. These are typically the most topical.
 */
export async function getIntroLinks(title: string): Promise<string[]> {
  const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(
    title
  )}&prop=links&section=0&format=json&origin=*`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const data = await res.json();
  const links: { ns: number; exists?: string; '*': string }[] =
    data?.parse?.links ?? [];
  return links
    .filter((l) => l.ns === 0 && l.exists !== undefined)
    .map((l) => l['*'])
    .filter((t) => !isJunkLink(t));
}

export async function getWikiSummary(title: string): Promise<{
  title: string;
  extract: string;
  type: string;
} | null> {
  const url = `${WIKI_REST}/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.type === 'disambiguation') {
    const links = await getWikiLinks(title);
    if (links.length > 0) {
      return getWikiSummary(links[0]);
    }
    return null;
  }
  return {
    title: data.title,
    extract: data.extract || '',
    type: data.type || 'standard',
  };
}

/**
 * Distribute points inside a sphere (not just surface) using a Fibonacci lattice
 * scaled by varying radii so child nodes feel voluminous rather than flat.
 *
 * @param count - number of points to generate
 * @param radius - base sphere radius
 * @param perNodeRadii - optional per-node radius overrides (replaces base radius for that node)
 */
export function distributeOnSphere(
  count: number,
  radius = 5,
  perNodeRadii?: number[]
): { x: number; y: number; z: number }[] {
  if (count === 0) return [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (i / (count - 1 || 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const t = phi * i;
    // If per-node radius provided, use it; otherwise apply slight jitter around base
    const rad = perNodeRadii?.[i] !== undefined
      ? perNodeRadii[i]
      : radius * (0.85 + ((i * 17) % 7) / 30);
    return {
      x: Math.cos(t) * r * rad,
      y: y * rad * 0.75,
      z: Math.sin(t) * r * rad,
    };
  });
}

/**
 * Pick a combined list of high-value links, favoring intro links first.
 */
export function combineLinks(
  introLinks: string[],
  allLinks: string[],
  count = 15
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (arr: string[]) => {
    for (const link of arr) {
      if (out.length >= count) return;
      const key = link.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(link);
    }
  };
  push(introLinks);
  push(allLinks);
  return out;
}
