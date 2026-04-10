/**
 * Simple test script for Wikidata integration
 * Run with: node test-wikidata.mjs
 */

// Import using Node's module system (since this is ES modules)
const testTopics = ['Machine Learning', 'Neural Network', 'Deep Learning'];

async function testWikidataResolution() {
  console.log('🧪 Testing Wikidata Integration\n');
  console.log('=' .repeat(60));

  for (const topic of testTopics) {
    try {
      console.log(`\n📚 Topic: "${topic}"`);

      // Make request to Wikidata API
      const searchUrl = `https://www.wikidata.org/w/api.php?action=query&titles=${encodeURIComponent(topic)}&prop=pageprops&format=json`;
      const response = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });

      if (!response.ok) {
        console.log(`   ❌ HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const pages = data.query?.pages || {};
      const page = Object.values(pages)[0];

      if (!page?.pageprops?.wikibase_item) {
        console.log(`   ❓ No Wikidata entity found via direct lookup`);

        // Try fallback via Wikipedia
        const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(topic)}&prop=pageprops&format=json`;
        const wikiResponse = await fetch(wikiUrl, { signal: AbortSignal.timeout(5000) });
        const wikiData = await wikiResponse.json();
        const wikiPages = wikiData.query?.pages || {};
        const wikiPage = Object.values(wikiPages)[0];

        if (wikiPage?.pageprops?.wikibase_item) {
          const qid = wikiPage.pageprops.wikibase_item;
          console.log(`   ✅ Found via Wikipedia fallback: ${qid}`);
          await testEntityData(qid, topic);
        } else {
          console.log(`   ❌ Not found in either API`);
        }
      } else {
        const qid = page.pageprops.wikibase_item;
        console.log(`   ✅ Found: ${qid}`);
        await testEntityData(qid, topic);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ Test complete!\n');
}

async function testEntityData(qid, topic) {
  try {
    const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(qid)}&props=labels|descriptions|claims&format=json&languages=en`;
    const response = await fetch(entityUrl, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const entity = data.entities?.[qid];

    if (!entity) {
      console.log(`   ❌ Failed to fetch entity data`);
      return;
    }

    const label = entity.labels?.en?.value || qid;
    const description = entity.descriptions?.en?.value || '';
    const claims = entity.claims || {};

    // Extract P279 (subclass_of) and P361 (part_of)
    const p279 = (claims['P279'] || []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
    const p361 = (claims['P361'] || []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);

    console.log(`   Label: ${label}`);
    console.log(`   Description: ${description}`);
    if (p279.length > 0) console.log(`   Subclass of: ${p279.slice(0, 3).join(', ')}`);
    if (p361.length > 0) console.log(`   Part of: ${p361.slice(0, 3).join(', ')}`);
  } catch (error) {
    console.log(`   ❌ Error fetching entity data: ${error.message}`);
  }
}

testWikidataResolution();
