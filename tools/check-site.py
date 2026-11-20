#!/usr/bin/env python3
"""Check the site's pages before a push. Run: python3 -I tools/check-site.py

- every local href and src resolves to a file in the repository;
- no page loads anything from another host (stylesheets, scripts, images,
  fonts, iframes; plain <a> links out are fine);
- blog/feed.xml and sitemap.xml parse, and list the same posts as /blog/;
- each post has a title, description, canonical, preview tags and JSON-LD
  that parses; every h2 in an article has an id; every figure's SVG has a
  <title> and <desc>, and every figure a caption.
Exits 1 with a list of problems, 0 when clean.
"""
import html.parser
import json
import os
import re
import sys
import urllib.parse
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://thenoonlight.com"
SKIP_DIRS = {".git", "tools", "node_modules"}
problems = []


def bad(page, msg):
    problems.append("%s: %s" % (os.path.relpath(page, ROOT), msg))


class Page(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags = []          # (tag, attrs dict)
        self.stack = []
        self.jsonld = []
        self._in_ld = False
        self._ld = ""
        self.figures = []       # dicts: svg, title, desc, caption, text_alt
        self._fig = None
        self.in_article = False
        self.h2_ids = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.tags.append((tag, a))
        if tag == "script" and a.get("type") == "application/ld+json":
            self._in_ld, self._ld = True, ""
        if tag == "article":
            self.in_article = True
        if tag == "h2" and self.in_article:
            self.h2_ids.append(a.get("id"))
        if tag == "figure":
            self._fig = {"svg": 0, "title": 0, "desc": 0, "caption": 0, "role": 0}
        if self._fig is not None:
            if tag == "svg":
                self._fig["svg"] += 1
                if a.get("role") == "img":
                    self._fig["role"] += 1
            elif tag == "title":
                self._fig["title"] += 1
            elif tag == "desc":
                self._fig["desc"] += 1
            elif tag == "figcaption":
                self._fig["caption"] += 1

    def handle_endtag(self, tag):
        if tag == "script" and self._in_ld:
            self._in_ld = False
            self.jsonld.append(self._ld)
        if tag == "article":
            self.in_article = False
        if tag == "figure" and self._fig is not None:
            self.figures.append(self._fig)
            self._fig = None

    def handle_data(self, data):
        if self._in_ld:
            self._ld += data


def local_target(page, url):
    """The file a local URL names, or None for an outside or special link."""
    u = urllib.parse.urlsplit(url)
    if u.scheme in ("mailto", "tel", "data", "javascript"):
        return None
    if u.scheme or u.netloc:
        if (u.scheme + "://" + u.netloc) == SITE:
            path = u.path
        else:
            return None
    else:
        path = u.path
    if not path:
        return None          # a pure #fragment
    if path.startswith("/"):
        f = os.path.join(ROOT, path.lstrip("/"))
    else:
        f = os.path.normpath(os.path.join(os.path.dirname(page), path))
    if f.endswith("/") or os.path.isdir(f):
        f = os.path.join(f, "index.html")
    return f


def pages():
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS and not x.startswith(".")]
        for f in files:
            if f.endswith(".html"):
                yield os.path.join(d, f)


LOADS = {"link": "href", "script": "src", "img": "src", "source": "src",
         "iframe": "src", "video": "src", "audio": "src", "embed": "src", "object": "data"}

blog_posts = set()
for page in sorted(pages()):
    text = open(page, encoding="utf-8").read()
    p = Page()
    p.feed(text)
    ids = set(re.findall(r'\sid="([^"]+)"', text))
    for tag, a in p.tags:
        for attr in ("href", "src"):
            url = a.get(attr)
            if not url:
                continue
            u = urllib.parse.urlsplit(url)
            loads = LOADS.get(tag) == attr and not (tag == "link" and a.get("rel") in ("canonical", "alternate"))
            outside = (u.scheme in ("http", "https") and (u.scheme + "://" + u.netloc) != SITE)
            if loads and outside:
                bad(page, "loads from another host: <%s %s=%s>" % (tag, attr, url))
            if not u.scheme and not u.netloc and not u.path and u.fragment:
                if u.fragment not in ids:
                    bad(page, "anchor #%s has no target" % u.fragment)
                continue
            f = local_target(page, url)
            if f and not os.path.exists(f):
                bad(page, "%s=%s resolves to no file" % (attr, url))
    for m in re.finditer(r'url\(\s*["\']?(https?:)?//', text):
        bad(page, "inline style loads from another host")
    for ld in p.jsonld:
        try:
            json.loads(ld)
        except ValueError as e:
            bad(page, "JSON-LD doesn't parse: %s" % e)

    rel = os.path.relpath(page, ROOT)
    m = re.fullmatch(r"blog/([a-z0-9-]+)/index\.html", rel)
    if m:
        slug = m.group(1)
        blog_posts.add(slug)
        metas = {(a.get("property") or a.get("name")): a.get("content") for t, a in p.tags if t == "meta"}
        canon = [a.get("href") for t, a in p.tags if t == "link" and a.get("rel") == "canonical"]
        if not re.search(r"<title>[^<{]+</title>", text):
            bad(page, "no title")
        for key in ("description", "og:title", "og:description", "og:image", "og:url",
                    "twitter:card", "twitter:image", "article:published_time"):
            if not metas.get(key) or "{{" in metas.get(key, ""):
                bad(page, "missing or unfilled <meta %s>" % key)
        if canon != ["%s/blog/%s/" % (SITE, slug)]:
            bad(page, "canonical is %r" % canon)
        if not os.path.exists(os.path.join(ROOT, "blog", slug, "og.png")):
            bad(page, "no blog/%s/og.png" % slug)
        if not any('"BlogPosting"' in ld for ld in p.jsonld):
            bad(page, "no BlogPosting JSON-LD")
        if "{{" in text:
            bad(page, "an unfilled {{…}} remains")
        for i in p.h2_ids:
            if not i:
                bad(page, "an h2 without an id")
        for n, fig in enumerate(p.figures, 1):
            if not fig["caption"]:
                bad(page, "figure %d has no figcaption" % n)
            if fig["svg"] and not (fig["title"] and fig["desc"] and fig["role"]):
                bad(page, "figure %d's SVG lacks role=img, <title> or <desc>" % n)

# the index, the feed and the sitemap list the same posts
index = open(os.path.join(ROOT, "blog", "index.html"), encoding="utf-8").read()
listed = set(re.findall(r'<li><a href="/blog/([a-z0-9-]+)/"', index))
atom = "{http://www.w3.org/2005/Atom}"
try:
    feed = ET.parse(os.path.join(ROOT, "blog", "feed.xml")).getroot()
    in_feed = set()
    for e in feed.iter(atom + "entry"):
        for l in e.iter(atom + "link"):
            m = re.fullmatch(SITE + r"/blog/([a-z0-9-]+)/", l.get("href", ""))
            if m:
                in_feed.add(m.group(1))
except ET.ParseError as e:
    problems.append("blog/feed.xml doesn't parse: %s" % e)
    in_feed = set()
try:
    sm = ET.parse(os.path.join(ROOT, "sitemap.xml")).getroot()
    locs = [l.text for l in sm.iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
    in_map = {m.group(1) for m in (re.fullmatch(SITE + r"/blog/([a-z0-9-]+)/", x or "") for x in locs) if m}
    if SITE + "/blog/" not in locs:
        problems.append("sitemap.xml lacks /blog/")
except ET.ParseError as e:
    problems.append("sitemap.xml doesn't parse: %s" % e)
    in_map = set()
for name, got in (("blog/index.html", listed), ("blog/feed.xml", in_feed), ("sitemap.xml", in_map)):
    if got != blog_posts:
        problems.append("%s lists %s; the posts are %s" % (name, sorted(got), sorted(blog_posts)))

if problems:
    print("\n".join(problems))
    sys.exit(1)
print("site ok: %d posts" % len(blog_posts))
