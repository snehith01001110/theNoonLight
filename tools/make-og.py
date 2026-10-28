#!/usr/bin/env python3
"""Render og.png — the link-preview card for thenoonlight.com.

Adapted from the Pixel Pane site's tools/make-og.py. Mirrors the hero: the app
icon, wordmark, tagline, mono footer, over the noonlight theme's amber glow. Output
is 1200x630, rendered at 2x. Needs Pillow and macOS for SF Pro; JetBrains Mono
is fetched from Google Fonts and cached in tools/.fonts (not committed).

    python3 tools/make-og.py

The icon is tools/icon-512.png, the app's 512 px icon (the page serves a
smaller icon.png). After regenerating, bump the ?v= on og:image and twitter:image in
index.html: Slack, iMessage and X cache the old artwork against the old URL.
"""
import math
import os
import re
import sys
import urllib.request
from PIL import Image, ImageDraw, ImageFont

W, H, SS = 1200, 630, 2           # supersample factor for crisp shapes
INK = (11, 10, 8)                 # theme: panel background
PAPER = (235, 219, 178)           # theme: foreground
AMBER = (216, 166, 87)            # theme: accent; on the tagline
PINK = (211, 134, 155)
AQUA = (125, 174, 163)
MUTED = (168, 153, 132)           # theme: text.muted
FAINT = (146, 131, 116)           # theme: terminal dim foreground

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SF = "/System/Library/Fonts/SFNS.ttf"          # --display resolves to this on Mac
CACHE = os.path.join(HERE, ".fonts")
# A bare UA gets .ttf back; modern ones get .woff2, which Pillow can't read.
GF = "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500"


def mono(size):
    ttf = os.path.join(CACHE, "JetBrainsMono-Medium.ttf")
    if not os.path.exists(ttf):
        os.makedirs(CACHE, exist_ok=True)
        css = urllib.request.urlopen(
            urllib.request.Request(GF, headers={"User-Agent": "Mozilla/5.0"})
        ).read().decode()
        url = re.search(r"https://\S+?\.ttf", css).group(0)
        with open(ttf, "wb") as fh:
            fh.write(urllib.request.urlopen(url).read())
    return ImageFont.truetype(ttf, size)


def sf(size, weight):
    f = ImageFont.truetype(SF, size)
    f.set_variation_by_name(weight)
    return f


def tracked(draw, xy, text, font, fill, tracking=0, anchor_center=True):
    """Draw text with letter-spacing; returns total width."""
    widths = [draw.textlength(c, font=font) for c in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x, y = xy
    if anchor_center:
        x -= total / 2
    for c, w in zip(text, widths):
        draw.text((x, y), c, font=font, fill=fill)
        x += w + tracking
    return total


def radial(size, cx, cy, rx, ry, rgb, peak, stop):
    """A soft radial glow layer, matching the site's body::before gradients."""
    w, h = size
    layer = Image.new("L", (int(w / 8), int(h / 8)), 0)
    px = layer.load()
    lw, lh = layer.size
    for yy in range(lh):
        for xx in range(lw):
            dx = (xx * 8 - cx) / rx
            dy = (yy * 8 - cy) / ry
            d = math.hypot(dx, dy)
            if d >= stop:
                continue
            px[xx, yy] = int(peak * 255 * (1 - d / stop) ** 2)
    layer = layer.resize((w, h), Image.BICUBIC)
    tint = Image.new("RGB", (w, h), rgb)
    return tint, layer


def build():
    w, h = W * SS, H * SS
    img = Image.new("RGB", (w, h), INK)

    # ambient glow — white bloom off the top edge, warm pool under the mark
    for cx, cy, rx, ry, rgb, peak, stop in (
        (w / 2, -0.12 * h, 0.54 * w, 0.34 * h * 2.2, AMBER, 0.26, 1.0),
        (0.12 * w, 0.95 * h, 0.40 * w, 0.30 * h * 2.2, PINK, 0.13, 1.0),
        (0.90 * w, 0.85 * h, 0.36 * w, 0.28 * h * 2.2, AQUA, 0.11, 1.0),
    ):
        tint, mask = radial((w, h), cx, cy, rx, ry, rgb, peak, stop)
        img.paste(tint, (0, 0), mask)

    d = ImageDraw.Draw(img, "RGBA")

    # The mark, taken straight from Noon's app icon.
    icon_path = os.path.join(HERE, "icon-512.png")
    if not os.path.exists(icon_path):
        sys.exit("missing %s" % icon_path)
    side = int(0.14 * w)
    icon = Image.open(icon_path).convert("RGBA").resize((side, side), Image.LANCZOS)
    img.paste(icon, (int(w / 2 - side / 2), int(0.245 * h - side / 2)), icon)

    # wordmark
    tsize = int(0.088 * w)
    title = sf(tsize, "Semibold")
    tracked(d, (w / 2, int(0.40 * h)), "Noon", title, PAPER,
            tracking=-0.035 * tsize)

    # tagline — accent on the product noun
    sub = sf(int(0.028 * w), "Regular")
    head, tail = "Run coding agents side by side, ", "and see where they're working."
    tw = d.textlength(head, font=sub) + d.textlength(tail, font=sub)
    x = w / 2 - tw / 2
    y = int(0.645 * h)
    d.text((x, y), head, font=sub, fill=MUTED)
    d.text((x + d.textlength(head, font=sub), y), tail, font=sub, fill=AMBER)

    # mono footer
    fsize = int(0.0165 * w)
    foot = mono(fsize)
    tracked(d, (w / 2, int(0.855 * h)), "THENOONLIGHT.COM  ·  MACOS  ·  FREE",
            foot, FAINT, tracking=0.16 * fsize)

    return img.resize((W, H), Image.LANCZOS)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "og.png")
    build().save(out, optimize=True)
    print("wrote %s (%.0f KB)" % (out, os.path.getsize(out) / 1024))
