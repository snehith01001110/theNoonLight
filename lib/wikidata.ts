/**
 * Wikidata API integration with in-memory caching
 * Provides low-level entity resolution and relationship fetching
 */

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

// Types
export interface WikidataEntity {
  qid: string;
  label: string;
  description: string;
  subclassOf: string[]; // P279 values
  partOf: string[]; // P361 values
  instanceOf: string[]; // P31 values
  linkedArticles?: number; // P4613
}

interface CacheEntry {
  entity: WikidataEntity;
  timestamp: number;
}

// In-memory LRU cache
class LRUCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize = 1000;
  private requestTimestamps: number[] = [];

  get(key: string): WikidataEntity | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    return entry.entity;
  }

  set(key: string, entity: WikidataEntity): void {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value as string | undefined;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, { entity, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
    this.requestTimestamps = [];
  }

  // Rate limiting: track request timestamps
  async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    // Remove timestamps older than 1 second
    this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 1000);

    // If we've made 20+ requests in the last second, wait
    if (this.requestTimestamps.length >= 20) {
      const oldestRequest = this.requestTimestamps[0];
      const waitTime = 1000 - (now - oldestRequest);
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    this.requestTimestamps.push(Date.now());
  }
}

const cache = new LRUCache();

/**
 * Search for a Wikidata entity by Wikipedia article title
 */
export async function searchWikidataEntity(title: string): Promise<WikidataEntity | null> {
  const cacheKey = title.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    await cache.waitForRateLimit();

    // Try direct search first
    const response = await fetch(`${WIKIDATA_API}?action=query&titles=${encodeURIComponent(title)}&prop=pageprops&format=json`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = (await response.json()) as any;
    const pages = data.query?.pages || {};
    const page = Object.values(pages)[0] as any;

    if (!page?.pageprops?.wikibase_item) {
      // Try reverse search via Wikipedia article name
      return await resolveViaWikipediaSearch(title);
    }

    const qid = page.pageprops.wikibase_item;
    const entity = await getEntityData(qid, ['P279', 'P361', 'P31', 'P4613']);
    if (entity) {
      cache.set(cacheKey, entity);
    }
    return entity;
  } catch (error) {
    console.warn(`[wikidata] Failed to search entity for "${title}":`, error);
    return null;
  }
}

/**
 * Fallback: search for Wikidata entity via Wikipedia API
 */
async function resolveViaWikipediaSearch(title: string): Promise<WikidataEntity | null> {
  try {
    await cache.waitForRateLimit();

    const response = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageprops&format=json`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = (await response.json()) as any;
    const pages = data.query?.pages || {};
    const page = Object.values(pages)[0] as any;

    if (!page?.pageprops?.wikibase_item) {
      return null;
    }

    const qid = page.pageprops.wikibase_item;
    return await getEntityData(qid, ['P279', 'P361', 'P31', 'P4613']);
  } catch (error) {
    console.warn(`[wikidata] Fallback search failed for "${title}":`, error);
    return null;
  }
}

/**
 * Fetch specific properties for a Wikidata entity
 */
export async function getEntityData(entityId: string, properties: string[]): Promise<WikidataEntity | null> {
  try {
    await cache.waitForRateLimit();

    const propsParam = properties.join('|');
    const response = await fetch(
      `${WIKIDATA_API}?action=wbgetentities&ids=${encodeURIComponent(entityId)}&props=labels|descriptions|claims&format=json&languages=en`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = (await response.json()) as any;
    const entity = data.entities?.[entityId];

    if (!entity) return null;

    // Extract label and description
    const label = entity.labels?.en?.value || entityId;
    const description = entity.descriptions?.en?.value || '';

    // Extract claims (relationships)
    const claims = entity.claims || {};
    const subclassOf = extractClaims(claims['P279'] || []); // subclass_of
    const partOf = extractClaims(claims['P361'] || []); // part_of
    const instanceOf = extractClaims(claims['P31'] || []); // instance_of
    const linkedArticles = extractNumericClaim(claims['P4613']?.[0]); // linked articles count

    const wikidataEntity: WikidataEntity = {
      qid: entityId,
      label,
      description,
      subclassOf,
      partOf,
      instanceOf,
      linkedArticles,
    };

    return wikidataEntity;
  } catch (error) {
    console.warn(`[wikidata] Failed to fetch entity data for "${entityId}":`, error);
    return null;
  }
}

/**
 * Batch fetch multiple entities
 */
export async function batchGetEntities(entityIds: string[], properties: string[]): Promise<Map<string, WikidataEntity>> {
  const results = new Map<string, WikidataEntity>();

  // Wikidata API supports up to 50 entities per request
  for (let i = 0; i < entityIds.length; i += 50) {
    const batch = entityIds.slice(i, i + 50);

    try {
      await cache.waitForRateLimit();

      const response = await fetch(
        `${WIKIDATA_API}?action=wbgetentities&ids=${batch.join('|')}&props=labels|descriptions|claims&format=json&languages=en`,
        { signal: AbortSignal.timeout(10000) }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as any;
      const entities = data.entities || {};

      for (const [qid, entity] of Object.entries(entities)) {
        const ent = entity as any;
        if (!ent.labels) continue;

        const label = ent.labels?.en?.value || qid;
        const description = ent.descriptions?.en?.value || '';
        const claims = ent.claims || {};

        const wikidataEntity: WikidataEntity = {
          qid,
          label,
          description,
          subclassOf: extractClaims(claims['P279'] || []),
          partOf: extractClaims(claims['P361'] || []),
          instanceOf: extractClaims(claims['P31'] || []),
          linkedArticles: extractNumericClaim(claims['P4613']?.[0]),
        };

        results.set(qid, wikidataEntity);
        cache.set(label.toLowerCase(), wikidataEntity);
      }
    } catch (error) {
      console.warn(`[wikidata] Batch fetch failed for batch ${i}-${i + 50}:`, error);
    }
  }

  return results;
}

/**
 * Resolve Wikipedia title directly to entity
 * This is the main entry point for the enrichment pipeline
 */
export async function resolveWikipediaTitle(title: string): Promise<WikidataEntity | null> {
  const cacheKey = title.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  return await searchWikidataEntity(title);
}

/**
 * Extract claim values from Wikidata claim structure
 */
function extractClaims(claims: any[]): string[] {
  return claims
    .map((claim) => {
      const mainSnak = claim.mainsnak;
      if (mainSnak?.snaktype === 'value' && mainSnak?.datavalue?.type === 'wikibase-entityid') {
        return mainSnak.datavalue.value.id;
      }
      return null;
    })
    .filter(Boolean) as string[];
}

/**
 * Extract numeric claim value (e.g., P4613 for article count)
 */
function extractNumericClaim(claim: any): number | undefined {
  if (!claim) return undefined;
  const mainSnak = claim.mainsnak;
  if (mainSnak?.snaktype === 'value' && mainSnak?.datavalue?.type === 'quantity') {
    const amount = mainSnak.datavalue.value?.amount;
    return amount ? parseInt(amount, 10) : undefined;
  }
  return undefined;
}

/**
 * Clear cache (useful for testing or after request completion)
 */
export function clearCache(): void {
  cache.clear();
}
