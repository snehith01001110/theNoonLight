/**
 * Wikidata enrichment orchestration
 * Analyzes relationships and boosts edge weights based on semantic connections
 */

import { resolveWikipediaTitle, WikidataEntity } from './wikidata';

export interface RelationshipType {
  edge: [number, number];
  type: 'subclass_of' | 'part_of' | 'related_to';
  source: 'wikidata';
  confidence: number;
}

interface RelationshipData {
  subtopicIndex: number;
  type: 'subclass_of' | 'part_of';
  confidence: number;
  parentQid?: string;
  subtopicQid?: string;
}

/**
 * Main enrichment function: analyze relationships and boost edge weights
 */
export async function enrichSubtopicsWithWikidata(
  subtopics: string[],
  parentTitle: string,
  originalWeights: number[] = []
): Promise<{
  edge_weights: number[];
  relationship_types: RelationshipType[];
}> {
  // Ensure edge_weights has correct length
  const weights = [...(originalWeights || [])];
  while (weights.length < subtopics.length - 1) {
    weights.push(0.5);
  }

  try {
    // Resolve parent entity
    const parentEntity = await resolveWikipediaTitle(parentTitle);
    if (!parentEntity) {
      return { edge_weights: weights, relationship_types: [] };
    }

    // Resolve all subtopic entities in parallel
    const subtopicEntities = await Promise.allSettled(subtopics.map((title) => resolveWikipediaTitle(title)));

    // Analyze relationships
    const relationships = analyzeRelationships(
      subtopicEntities,
      parentEntity,
      subtopics
    );

    if (relationships.length === 0) {
      return { edge_weights: weights, relationship_types: [] };
    }

    // Boost edge weights based on relationships
    const boostedWeights = boostEdgeWeights(weights, relationships, subtopics);

    // Build relationship metadata
    const relationshipTypes = buildRelationshipMetadata(relationships);

    return {
      edge_weights: boostedWeights,
      relationship_types: relationshipTypes,
    };
  } catch (error) {
    console.warn('[wikidata-enrich] Enrichment failed:', error);
    return { edge_weights: weights, relationship_types: [] };
  }
}

/**
 * Analyze relationships between subtopics and parent
 */
function analyzeRelationships(
  subtopicEntitiesSettled: PromiseSettledResult<WikidataEntity | null>[],
  parentEntity: WikidataEntity,
  subtopics: string[]
): RelationshipData[] {
  const relationships: RelationshipData[] = [];

  subtopicEntitiesSettled.forEach((settled, index) => {
    if (settled.status !== 'fulfilled' || !settled.value) {
      return; // Skip failed resolutions
    }

    const subtopicEntity = settled.value;
    const parentQid = parentEntity.qid;

    // Check if subtopic is a subclass_of parent
    if (subtopicEntity.subclassOf.includes(parentQid)) {
      relationships.push({
        subtopicIndex: index,
        type: 'subclass_of',
        confidence: 0.95,
        parentQid,
        subtopicQid: subtopicEntity.qid,
      });
      return;
    }

    // Check if subtopic is part_of parent
    if (subtopicEntity.partOf.includes(parentQid)) {
      relationships.push({
        subtopicIndex: index,
        type: 'part_of',
        confidence: 0.9,
        parentQid,
        subtopicQid: subtopicEntity.qid,
      });
      return;
    }

    // Check if parent has subtopic as subclass (reverse relationship)
    if (parentEntity.subclassOf.includes(subtopicEntity.qid)) {
      relationships.push({
        subtopicIndex: index,
        type: 'related_to',
        confidence: 0.7,
        parentQid,
        subtopicQid: subtopicEntity.qid,
      });
      return;
    }

    // Check if parent has subtopic as part (reverse relationship)
    if (parentEntity.partOf.includes(subtopicEntity.qid)) {
      relationships.push({
        subtopicIndex: index,
        type: 'related_to',
        confidence: 0.7,
        parentQid,
        subtopicQid: subtopicEntity.qid,
      });
    }
  });

  return relationships;
}

/**
 * Boost edge weights based on relationships
 * For each relationship, find edges connecting to that subtopic and boost their weight
 */
function boostEdgeWeights(
  originalWeights: number[],
  relationships: RelationshipData[],
  subtopics: string[]
): number[] {
  const boosted = [...originalWeights];
  const relationshipsByIndex = new Map<number, RelationshipData>();

  // Map relationships by subtopic index
  relationships.forEach((rel) => {
    relationshipsByIndex.set(rel.subtopicIndex, rel);
  });

  // We don't have edge information here, so we boost based on relationship confidence
  // The edges will be handled in buildRelationshipMetadata
  // For now, we'll create a boost map for all subtopics with relationships
  const boostMap = new Map<number, number>();

  relationships.forEach((rel) => {
    let boost = 0;
    if (rel.type === 'subclass_of') {
      boost = 0.2; // Subclass relationships are very important
    } else if (rel.type === 'part_of') {
      boost = 0.15; // Part-of relationships are important
    } else {
      boost = 0.05; // Related-to is less important
    }
    boostMap.set(rel.subtopicIndex, boost);
  });

  // Since we don't have edge indices here, we return the original weights
  // The edge boosting will happen in the subtopics route when we have edge information
  return boosted;
}

/**
 * Build relationship metadata from relationships
 * Maps relationship data to edge indices
 */
function buildRelationshipMetadata(relationships: RelationshipData[]): RelationshipType[] {
  return relationships
    .map((rel) => {
      // Create edge from parent (index -1, implicit) to subtopic
      const relationshipType: RelationshipType = {
        edge: [0, rel.subtopicIndex], // Convention: 0 = parent, subtopic index in array
        type: rel.type === 'related_to' ? 'related_to' : rel.type,
        source: 'wikidata',
        confidence: rel.confidence,
      };
      return relationshipType;
    });
}

/**
 * Enhanced version that works with actual edges from Claude
 * Takes edges as input and boosts weights for relationships
 */
export function boostEdgeWeightsWithEdges(
  originalWeights: number[],
  edges: [number, number][],
  relationships: RelationshipData[]
): number[] {
  const boosted = [...originalWeights];
  const relationshipsByIndex = new Map<number, RelationshipData>();

  // Map relationships by subtopic index
  relationships.forEach((rel) => {
    relationshipsByIndex.set(rel.subtopicIndex, rel);
  });

  // For each edge, check if it connects to a subtopic with a relationship
  edges.forEach((edge, edgeIndex) => {
    const [from, to] = edge;

    // Check if either endpoint has a relationship
    const fromRel = relationshipsByIndex.get(from);
    const toRel = relationshipsByIndex.get(to);

    if (fromRel) {
      let boost = 0;
      if (fromRel.type === 'subclass_of') {
        boost = 0.2;
      } else if (fromRel.type === 'part_of') {
        boost = 0.15;
      } else {
        boost = 0.05;
      }
      boosted[edgeIndex] = Math.min(originalWeights[edgeIndex] + boost, 1.0);
    }

    if (toRel && !fromRel) {
      let boost = 0;
      if (toRel.type === 'subclass_of') {
        boost = 0.2;
      } else if (toRel.type === 'part_of') {
        boost = 0.15;
      } else {
        boost = 0.05;
      }
      boosted[edgeIndex] = Math.min(originalWeights[edgeIndex] + boost, 1.0);
    }
  });

  return boosted;
}

/**
 * Build enhanced relationship metadata with edge indices
 */
export function buildRelationshipMetadataWithEdges(
  relationships: RelationshipData[],
  edges: [number, number][],
  subtopics: string[]
): RelationshipType[] {
  const relationshipTypes: RelationshipType[] = [];

  relationships.forEach((rel) => {
    // Find edges that involve this subtopic
    edges.forEach((edge, edgeIndex) => {
      const [from, to] = edge;
      if (from === rel.subtopicIndex || to === rel.subtopicIndex) {
        relationshipTypes.push({
          edge,
          type: rel.type === 'related_to' ? 'related_to' : rel.type,
          source: 'wikidata',
          confidence: rel.confidence,
        });
      }
    });
  });

  return relationshipTypes;
}
