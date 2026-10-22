"""Draws the "T." app icons (same geometry as src/components/BigT.tsx) in the Jade theme colours.
Writes public/favicon.png, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png.
Run: npm run icons   (needs Pillow). Swap in your own artwork any time: just keep the file names."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'public'
BG = (11, 25, 22)          # --bg of jade, hsl(168 38% 7%)
GLOW = (26, 230, 161)      # --accent of jade, hsl(160 80% 50%)
LETTER = (239, 255, 251)   # --letter, hsl(168 100% 97%)
S = 1024                   # draw big, scale down for crisp edges


def mark(size: int, pad: float, rounded: bool, glow: bool) -> Image.Image:
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    bg = Image.new('RGBA', (S, S), BG + (255,))
    if glow:
        g = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(g).ellipse((-S * 0.25, -S * 0.35, S * 0.75, S * 0.55), fill=GLOW + (70,))
        bg = Image.alpha_composite(bg, g.filter(ImageFilter.GaussianBlur(S * 0.12)))
    mask = Image.new('L', (S, S), 0)
    if rounded:
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.22), fill=255)
    else:
        mask.paste(255, (0, 0, S, S))
    img.paste(bg, (0, 0), mask)

    # the T + dot live in an 800x640 box (BigT viewBox), centred inside the padding
    box = S * (1 - 2 * pad)
    k = box / 800
    ox, oy = S * pad, (S - 640 * k) / 2
    d = ImageDraw.Draw(img)
    pts = [(0, 0), (600, 0), (600, 128), (361, 128), (361, 640), (239, 640), (239, 128), (0, 128)]
    d.polygon([(ox + x * k, oy + y * k) for x, y in pts], fill=LETTER + (255,))
    cx, cy, r = ox + 728 * k, oy + 572 * k, 68 * k
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=GLOW + (255,))
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    mark(64, 0.14, True, False).save(OUT / 'favicon.png')
    mark(192, 0.18, True, True).save(OUT / 'icon-192.png')
    mark(512, 0.18, True, True).save(OUT / 'icon-512.png')
    # maskable: full-bleed background, art inside the 80% safe zone
    mark(512, 0.24, False, True).save(OUT / 'icon-maskable-512.png')
    # iOS rounds the corners itself and dislikes transparency
    mark(180, 0.18, False, True).convert('RGB').save(OUT / 'apple-touch-icon.png')


if __name__ == '__main__':
    main()
