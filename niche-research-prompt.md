**I'm building a product called Graphmind (working title: "theNoonLight") and I need help finding the right niche — the specific audience and use case where this product is 10x better than alternatives, not just marginally better.**

## What the product is

Graphmind turns any topic into an interactive 3D knowledge graph. You type a topic (like "Quantum Computing" or "Roman Empire"), and the app:

1. Searches Wikipedia for the canonical article
2. Uses Claude AI (Anthropic's LLM) to curate the 12-15 most important subtopics from that article's Wikipedia links, organized into tiers: core concepts that define the topic, key prerequisites and subfields, and notable applications
3. Renders them as glowing spheres in a 3D space using WebGL (Three.js / React Three Fiber), where related subtopics are positioned closer together based on edge weights and force-directed layout
4. Lets you click any node to "dive in" — the camera animates into the sphere, which expands into its own knowledge graph of subtopics
5. Every node has an AI-generated summary in a sidebar panel, plus a per-node chat where you can ask Claude follow-up questions about that specific topic
6. You can keep diving infinitely: Quantum Computing → Qubit → Bloch Sphere → Hilbert Space → ...
7. Breadcrumb navigation lets you jump back to any ancestor level

The visual design is dark, minimal, polished — think high-end data visualization. Nodes are color-coded by graph relationships (connected topics share similar hues), sized by breadth of the topic, and positioned by relevance to the parent. There's a Wikidata enrichment layer that boosts accuracy of relationships.

## Tech stack (for context on what's feasible)

- Next.js 14 (App Router), TypeScript, Tailwind CSS
- React Three Fiber + Three.js for 3D
- Zustand for state management
- Supabase (PostgreSQL + Auth + Row Level Security) — each user's graph is private and persistent
- Claude API (Haiku for curation, Sonnet for summaries/chat)
- Wikipedia + Wikidata APIs as the knowledge source
- Deployed on Vercel

## Current state

- Working product, auth (email + Google OAuth), persistent graphs per user
- No tests, no CI/CD, no public/shared graphs yet
- No monetization, no analytics beyond Vercel basics
- No onboarding flow — users land on a minimal "I want to learn [___]" page

## What I'm trying to figure out

I don't want to be a generic "learning tool." I need to find the specific niche where this product's unique properties create the most value. The unique properties are:

1. **Spatial/visual knowledge structure** — you literally see how concepts relate in 3D space, not a flat list or linear article
2. **Infinite recursive depth** — you can keep drilling down from any concept, building a mental map as you go
3. **AI-curated paths** — Claude decides which subtopics matter most, not raw Wikipedia link dumps
4. **Conversational per-node** — you can ask questions about any specific concept in context
5. **Wikipedia-grounded** — not hallucinated content; the knowledge structure comes from real encyclopedia articles

## What I need from you

Research and analyze:

1. **Who specifically would value spatial/hierarchical knowledge exploration enough to use this regularly?** Not "students" broadly — which students, studying what, at what level, in what context? Not "curious people" — what specific curiosity-driven behavior does this serve better than existing tools?

2. **What are the existing alternatives and where do they fall short?** Think: Wikipedia itself, Obsidian's graph view, Roam Research, Khan Academy's knowledge map, Wolfram Alpha, concept mapping tools (CmapTools, Coggle), AI tutors (Khanmigo, Synthesis), and any 3D knowledge visualization tools that exist.

3. **What specific workflows or "jobs to be done" does this product uniquely enable?** For example: "I'm writing a research paper and need to understand how 5 unfamiliar concepts relate to each other" or "I'm preparing to teach a topic and need to see its prerequisite structure."

4. **What niche has the highest combination of: (a) pain with current tools, (b) willingness to pay, (c) natural word-of-mouth/shareability, and (d) alignment with what the product already does well?**

5. **What would the go-to-market look like for the top 2-3 niches?** Where do these people hang out? What would make them try this? What would make them stay?

Be specific and opinionated. I'd rather hear "this is a perfect fit for graduate students doing literature reviews in interdisciplinary fields, and here's why" than "students and lifelong learners could benefit." Challenge my assumptions if the niche I should target isn't obvious.
