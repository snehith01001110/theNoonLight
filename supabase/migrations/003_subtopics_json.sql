-- Store curated subtopics + edges as JSON on the parent node instead of
-- creating a separate row for every child. Dramatically reduces row count.
ALTER TABLE graph_nodes
  ADD COLUMN IF NOT EXISTS subtopics_json JSONB DEFAULT NULL;

-- Example shape:
-- { "titles": ["Algorithm", "Data structure", ...], "edges": [[0,1],[2,3]] }
