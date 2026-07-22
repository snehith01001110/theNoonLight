# theNoonLight

A small collection of projects at [thenoonlight.com](https://thenoonlight.com), hosted on GitHub Pages. The root (`index.html`) is a minimal hub that links to each project; every project lives at its own route (a directory with an `index.html`).

## Projects

### /universe — Since the Big Bang

An interactive timeline of the universe — 13.787 billion years as a grid of squares, from the Big Bang to today. A single self-contained static page: [`universe/index.html`](universe/index.html).

### /beta — It All Started Right Here

The same 13.8 billion years mapped at true scale onto one scroll-driven trip around the Earth, starting and ending at your own location. Source in [`beta-src/`](beta-src/) (Vite + MapLibre + Three.js), built output committed in [`beta/`](beta/). See [`beta-src/README.md`](beta-src/README.md) for build and deploy steps.

### /citizen — Citizen

A flashcard study app for the 2025 USCIS naturalization civics test (128 questions). Tap to flip between question and answer; step through in order or shuffle endlessly. Progress persists in `localStorage`. A single self-contained static page ([`citizen/index.html`](citizen/index.html)) plus its data file [`citizen/citizen-questions.json`](citizen/citizen-questions.json), extracted from the official USCIS document *128 Civics Questions and Answers (2025 version)*, M-1778 (09/25).

## Adding a project

Create a new directory with an `index.html` (self-contained where possible), link it from the hub in the root `index.html`, and add a short section here.
