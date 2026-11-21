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
- `fonts/`: Bricolage Grotesque (headlines), Inter (text) and Martian Mono
  (labels and buttons), self-hosted (Google Fonts' latin subsets, SIL OFL in
  `fonts/OFL-*.txt`), so the page loads nothing from other sites.
- `icon.png`, `favicon.svg`, `favicon.png`, `favicon.ico`, `logo.svg`: Noon's
  logo, drawn by `scripts/render-brand.swift` in the app's repository (pass it
  this folder); its `docs/BRAND.md` is the brand guide. Don't edit them by hand.
- `grain.png`, `og.png`: images. `og.png` (the link preview) is made by `python3 tools/make-og.py` (Pillow,
  macOS fonts); after regenerating it, bump the `?v=` on `og:image` and
  `twitter:image`.
- `robots.txt`, `sitemap.xml`: for search engines.
- `swarm.js`, `swarm.css`: the build-in effect. Agent cursors draw wireframes
  over the page and fill each layer in, at 4×, following the page's scroll
  until a visitor scrolls. The page is plain HTML underneath; with Reduce Motion
  or no JavaScript it is simply shown.
- `blog/`: the blog, "Design notes" (below). `blog/blog.css` is its reading
  layout on top of `style.css`'s tokens; `blog/feed.xml` is its Atom feed.
- `atlas/`, `beta/`: redirects from old addresses to the home page.
- `404.html`: shown for any other old address.

The site offers public downloads of Noon. `data-downloads-enabled="true"`
on the `<html>` element in `index.html` shows the download buttons, version,
installation steps, Homebrew command, release notes and checksum, and hides
beta messaging. Setting it to `"false"` instead offers beta contact by email.
This switch works without JavaScript and controls only the website's
presentation; GitHub releases retain their own access settings. Downloads
come from the public [noon-releases](https://github.com/snehith01001110/noon-releases)
repository, and the buttons point to its latest release.

**For a new release,** update the version and SHA-256 in `index.html`: the
line under the hero button, the footer's checksum, and `softwareVersion` in
the JSON-LD. Update `version` and `sha256` in
`tools/homebrew-noon/Casks/noon.rb` too, then publish the tap, the public
repository [homebrew-noon](https://github.com/snehith01001110/homebrew-noon):
`git subtree split --prefix tools/homebrew-noon -b tap-split && git push
https://github.com/snehith01001110/homebrew-noon.git tap-split:main && git
branch -D tap-split`.

Check that the split is a fast-forward from the tap's current `main` before
pushing. If the tap has advanced independently, copy the same cask into a
temporary checkout of the tap and commit/push it on that history instead;
never force the generated subtree over independent tap commits. Verify that
the two cask files are identical and name the published ZIP's exact checksum.

Earlier projects that lived here (/universe, the old /beta map, /citizen, /paloma and the
hub page) were taken down on October 27, 2026. They're in the history: the
tag `archive/before-noon` is the last commit with all of them.

## Writing a post

A post is a folder, `blog/<slug>/`, holding `index.html` and `og.png`. No
build step; every page loads only this site's files.

1. Copy `tools/post-template.html` to `blog/<slug>/index.html` and fill every
   `{{…}}`: the next number (`[02]`, …, two digits), title, description,
   standfirst, slug, date (`2026-11-20` and "November 20, 2026"), minutes
   (words ÷ 230), the article (each `h2` with an `id` and an
   `<a class="anchor" href="#id">#</a>`), the references, and the previous and
   next links (also add a "next" link to the post before it).
   The "On this page" list beside a post (wide screens) is built by
   `blog/blog.js` from the article's `h2`s; nothing to write. A table wider
   than the text takes `class="table-scroll wide"`, a `<colgroup>` and a
   `data-label` on each `<td>` (its column's name, shown on phones).
   Figures are inline SVG with `role="img"`, `<title>`, `<desc>` and a
   `<figcaption>`, using the colours in `style.css`.
2. Add it at the top of `blog/index.html`'s list (after `<!-- POSTS -->`).
3. Add an `<entry>` at the top of `blog/feed.xml` and set its `<updated>`.
4. Add its address to `sitemap.xml`.
5. `python3 tools/make-og.py --post <slug> "<title>" "[NN] Design notes"`.
6. `python3 -I tools/check-site.py` must print `site ok`. Preview with
   `python3 -m http.server 8080` and open `http://localhost:8080/blog/`.
