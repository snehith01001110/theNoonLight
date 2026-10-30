# thenoonlight.com

The page for **Noon**, a Mac app that runs coding agents side by side
(Claude Code and Codex) and shows where they're working. Hosted on GitHub
Pages from this repository's `main` branch.

- `index.html`, `style.css`, `demos.js`: the page and its interactive
  illustrations (no framework, no build step).
- Colours: the noonlight theme
  ([snehithnayak.github.io/themes](https://github.com/snehith01001110/snehithnayak.github.io/tree/main/themes)),
  as tokens at the top of `style.css`. The three agents are the theme's aqua,
  pink and green (`COLORS` in `demos.js`); amber is kept for approvals.
- `fonts/`: JetBrains Mono, self-hosted (latin subset, SIL OFL in
  `fonts/OFL.txt`), so the page loads nothing from other sites.
- `icon.png`, `favicon.svg`, `favicon.png`, `favicon.ico`, `wordmark.svg`,
  `tools/icon-512.png`: Noon's logo, drawn by `scripts/render-brand.swift` in
  the app's repository (pass it this folder); its `docs/BRAND.md` is the brand
  guide. Don't edit them by hand.
- `grain.png`, `og.png`: images. `og.png` (the link preview) is made by `python3 tools/make-og.py` (Pillow,
  macOS fonts); after regenerating it, bump the `?v=` on `og:image` and
  `twitter:image`.
- `robots.txt`, `sitemap.xml`: for search engines.
- `atlas/`: a redirect from the old address, `/atlas`, to the home page.
- `404.html`: shown for any other old address.

Downloads are GitHub releases of
[noon-releases](https://github.com/snehith01001110/noon-releases); the page's
buttons point to the latest one.

**For a new release,** update the version and SHA-256 in `index.html`: the
line under the hero button, the footer's checksum, and `softwareVersion` in
the JSON-LD. Update `version` and `sha256` in
`tools/homebrew-noon/Casks/noon.rb` too, then publish the tap, the public
repository [homebrew-noon](https://github.com/snehith01001110/homebrew-noon):
`git subtree split --prefix tools/homebrew-noon -b tap-split && git push
https://github.com/snehith01001110/homebrew-noon.git tap-split:main && git
branch -D tap-split`.

Earlier projects that lived here (/universe, /beta, /citizen, /paloma and the
hub page) were taken down on October 27, 2026. They're in the history: the
tag `archive/before-noon` is the last commit with all of them.
