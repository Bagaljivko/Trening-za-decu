#!/usr/bin/env python3
"""Generates the exercise illustrations in /images.

Every picture uses the same style: a light stick-figure child on a transparent
background (the app shows it on a dark card), a grey floor line, simple grey
props (chair, wall) and a green arrow for the direction of movement.

Run from the repo root:  python3 tools/make_images.py
"""
import math
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "images")

NEAR = "#F5F5F7"   # limbs closest to the viewer
FAR = "#A3A3AB"    # limbs on the far side
PROP = "#6E6E76"   # chair, wall
FLOOR = "#4A4A52"
ARROW = "#3DFF8F"
GROUND = 262


def seg(a, b, color, w=10):
    return f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="{color}" stroke-width="{w}"/>'


def poly(points, color, w=10):
    pts = " ".join(f"{x},{y}" for x, y in points)
    return f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{w}"/>'


def head_of(n, p):
    dx, dy = n[0] - p[0], n[1] - p[1]
    d = math.hypot(dx, dy) or 1
    return (round(n[0] + dx / d * 25), round(n[1] + dy / d * 25))


def arrow_head(tip, frm):
    dx, dy = tip[0] - frm[0], tip[1] - frm[1]
    d = math.hypot(dx, dy) or 1
    ux, uy = dx / d, dy / d
    L, Wd = 18, 11
    bx, by = tip[0] - ux * L, tip[1] - uy * L
    p1 = (bx - uy * Wd, by + ux * Wd)
    p2 = (bx + uy * Wd, by - ux * Wd)
    return (f'<polygon points="{tip[0]:.1f},{tip[1]:.1f} {p1[0]:.1f},{p1[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}" '
            f'fill="{ARROW}" stroke="none"/>')


def shorten(a, b, k=12):
    """Move point b toward a by k px (so the line ends under the arrow head)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    d = math.hypot(dx, dy) or 1
    return (b[0] - dx / d * k, b[1] - dy / d * k)


def arrow(spec):
    """('L', x1,y1,x2,y2, both?) straight, or ('Q', x1,y1,cx,cy,x2,y2, both?) curved."""
    kind = spec[0]
    both = spec[-1] is True
    out = []
    if kind == "L":
        a, b = spec[1:3], spec[3:5]
        a2 = shorten(b, a) if both else a
        b2 = shorten(a, b)
        out.append(f'<line x1="{a2[0]:.1f}" y1="{a2[1]:.1f}" x2="{b2[0]:.1f}" y2="{b2[1]:.1f}" '
                   f'stroke="{ARROW}" stroke-width="6"/>')
        out.append(arrow_head(b, a))
        if both:
            out.append(arrow_head(a, b))
    else:
        a, c, b = spec[1:3], spec[3:5], spec[5:7]
        a2 = shorten(c, a) if both else a
        b2 = shorten(c, b)
        out.append(f'<path d="M{a2[0]:.1f} {a2[1]:.1f} Q{c[0]} {c[1]} {b2[0]:.1f} {b2[1]:.1f}" fill="none" '
                   f'stroke="{ARROW}" stroke-width="6"/>')
        out.append(arrow_head(b, c))
        if both:
            out.append(arrow_head(a, c))
    return "".join(out)


def chair(x, facing="left", seat=196):
    """Side view of a chair. x = front edge of the seat; backrest on the far side."""
    w = 70
    x2 = x + w if facing == "left" else x - w   # facing left = sitter would face left
    lo, hi = min(x, x2), max(x, x2)
    back = x2
    parts = [
        seg((lo, seat), (hi, seat), PROP, 8),
        seg((lo + 4, seat), (lo + 4, GROUND), PROP, 6),
        seg((hi - 4, seat), (hi - 4, GROUND), PROP, 6),
        seg((back, seat), (back, seat - 78), PROP, 7),
    ]
    return "".join(parts)


def wall(x):
    return (seg((x, 30), (x, GROUND), PROP, 8) +
            "".join(seg((x, y), (x + (12 if x > 200 else -12), y - 12), PROP, 3) for y in range(50, GROUND, 26)))


def figure(p):
    N, P = p["N"], p["P"]
    H = p.get("H") or head_of(N, P)
    (k1, f1), (k2, f2) = p["legs"]
    (e1, w1), (e2, w2) = p["arms"]
    out = []
    # far side first
    out.append(poly([P, k1, f1], FAR))
    out.append(poly([N, e1, w1], FAR))
    for a, b in p.get("far_extra", []):
        out.append(seg(a, b, FAR, 8))
    out.append(seg(N, P, NEAR, 13))
    out.append(seg(N, H, NEAR, 8))
    out.append(poly([P, k2, f2], NEAR))
    out.append(poly([N, e2, w2], NEAR))
    for a, b in p.get("near_extra", []):
        out.append(seg(a, b, NEAR, 8))
    out.append(f'<circle cx="{H[0]}" cy="{H[1]}" r="18" fill="{NEAR}"/>')
    return "".join(out)


def svg(title, p):
    body = []
    if p.get("ground", True):
        body.append(seg((24, GROUND + 8), (376, GROUND + 8), FLOOR, 4))
    for prop in p.get("props", []):
        body.append(prop)
    body.append(figure(p))
    for extra in p.get("lines", []):     # e.g. speed lines
        body.append(extra)
    for a in p.get("arrows", []):
        body.append(arrow(a))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img" aria-label="{title}">'
            f'<title>{title}</title>'
            f'<g stroke-linecap="round" stroke-linejoin="round">{"".join(body)}</g></svg>\n')


def speed(x, y, n=3, length=34, gap=14):
    return "".join(seg((x, y + i * gap), (x - length + i * 6, y + i * gap), FAR, 4) for i in range(n))


# ---------------------------------------------------------------------------
# Poses. N = neck/shoulders, P = hips, legs = [(knee, foot) far, (knee, foot) near],
# arms = [(elbow, hand) far, (elbow, hand) near]. Side views face right.
G = GROUND
STAND_ARMS = [((196, 118), (194, 150)), ((206, 118), (208, 150))]

POSES = {
    "cucanj": ("Čučanj", dict(
        N=(202, 132), P=(165, 200),
        legs=[((216, 202), (200, G)), ((222, 205), (206, G))],
        arms=[((236, 138), (270, 136)), ((240, 142), (276, 140))],
        arrows=[("L", 100, 120, 100, 235, True)])),

    "iskorak-unazad": ("Iskorak unazad", dict(
        N=(208, 118), P=(205, 194),
        legs=[((180, 246), (130, 256)), ((252, 200), (252, G))],
        arms=[((206, 152), (204, 184)), ((214, 152), (216, 184))],
        arrows=[("Q", 175, 160, 120, 165, 105, 220)])),

    "bocni-iskorak": ("Bočni iskorak", dict(
        N=(198, 106), P=(200, 180),
        legs=[((150, 206), (138, G)), ((248, 220), (292, G))],
        arms=[((174, 132), (190, 166)), ((222, 132), (210, 166))],
        arrows=[("L", 200, 286, 104, 286)])),

    "zid-sed": ("Zid-sed", dict(
        N=(146, 124), P=(146, 200),
        legs=[((196, 199), (196, G)), ((202, 202), (202, G))],
        arms=[((172, 150), (190, 186)), ((178, 154), (198, 190))],
        props=[wall(124)],
        arrows=[("L", 262, 130, 262, 205)])),

    "most": ("Most", dict(
        N=(125, 250), P=(202, 204), H=(100, 244),
        legs=[((242, 196), (250, G)), ((248, 198), (258, G))],
        arms=[((160, 260), (196, 262)), ((164, 262), (200, 264))],
        arrows=[("L", 202, 186, 202, 130)])),

    "most-jedna-noga": ("Most na jednoj nozi", dict(
        N=(125, 250), P=(202, 204), H=(100, 244),
        legs=[((242, 196), (250, G)), ((248, 186), (296, 168))],
        arms=[((160, 260), (196, 262)), ((164, 262), (200, 264))],
        arrows=[("L", 202, 186, 202, 130)])),

    "podizanje-na-prste": ("Podizanje na prste", dict(
        N=(200, 70), P=(200, 146),
        legs=[((198, 196), (196, 244)), ((204, 196), (206, 244))],
        arms=[((196, 104), (194, 136)), ((206, 104), (208, 136))],
        far_extra=[((196, 244), (210, G))], near_extra=[((206, 244), (220, G))],
        arrows=[("L", 262, 170, 262, 92)])),

    "odbrambeni-korak": ("Odbrambeni korak", dict(
        N=(200, 112), P=(200, 186),
        legs=[((158, 212), (148, G)), ((242, 212), (252, G))],
        arms=[((166, 142), (140, 168)), ((234, 142), (260, 168))],
        arrows=[("L", 110, 288, 290, 288, True)])),

    "sklekovi": ("Sklekovi", dict(
        N=(252, 200), P=(170, 225),
        legs=[((128, 240), (86, 256)), ((130, 242), (90, 258))],
        arms=[((250, 230), (250, G)), ((256, 230), (258, G))],
        arrows=[("L", 320, 165, 320, 240, True)])),

    "sklekovi-kolena": ("Sklekovi na kolenima", dict(
        N=(256, 206), P=(185, 232),
        legs=[((146, 256), (112, 228)), ((150, 258), (116, 232))],
        arms=[((254, 234), (254, G)), ((260, 234), (262, G))],
        arrows=[("L", 322, 170, 322, 245, True)])),

    "sklekovi-stolica": ("Sklekovi na stolici", dict(
        N=(250, 168), P=(172, 212),
        legs=[((130, 236), (88, 258)), ((134, 238), (92, G))],
        arms=[((258, 184), (266, 194)), ((262, 186), (272, 194))],
        props=[chair(258, "left", 198)],
        arrows=[("L", 196, 104, 196, 160, True)])),

    "propadanja-stolica": ("Propadanja na stolici", dict(
        N=(172, 142), P=(176, 216),
        legs=[((222, 214), (226, G)), ((228, 216), (234, G))],
        arms=[((164, 170), (156, 194)), ((168, 172), (162, 194))],
        props=[chair(162, "right", 198)],
        arrows=[("L", 290, 135, 290, 210, True)])),

    "sklekovi-zid": ("Sklekovi uz zid", dict(
        N=(262, 104), P=(222, 172),
        legs=[((208, 216), (196, G)), ((212, 218), (202, G))],
        arms=[((290, 108), (318, 112)), ((292, 114), (320, 120))],
        props=[wall(328)],
        arrows=[("L", 238, 50, 312, 50, True)])),

    "plank": ("Plank", dict(
        N=(252, 210), P=(172, 230),
        legs=[((130, 241), (88, 254)), ((132, 243), (92, 257))],
        arms=[((248, 258), (290, 258)), ((256, 258), (298, 260))],
        arrows=[("L", 96, 214, 262, 172, True)])),

    "bocni-plank": ("Bočni plank", dict(
        N=(252, 196), P=(172, 222),
        legs=[((128, 238), (86, 254)), ((132, 236), (90, 250))],
        arms=[((252, 256), (292, 256)), ((254, 160), (256, 118))],
        arrows=[("L", 172, 206, 172, 160)])),

    "plank-dodir-ramena": ("Plank sa dodirom ramena", dict(
        N=(252, 200), P=(170, 225),
        legs=[((128, 240), (86, 256)), ((130, 242), (90, 258))],
        arms=[((250, 230), (250, G)), ((280, 222), (258, 202))],
        arrows=[("Q", 312, 250, 318, 196, 274, 176)])),

    "mrtva-buba": ("Mrtva buba", dict(
        N=(150, 244), P=(222, 244), H=(124, 242),
        legs=[((222, 196), (266, 196)), ((268, 230), (314, 234))],
        arms=[((150, 206), (150, 168)), ((120, 222), (88, 210))],
        arrows=[("Q", 92, 176, 64, 186, 70, 216), ("Q", 300, 196, 330, 202, 336, 226)])),

    "supermen": ("Supermen", dict(
        N=(270, 238), P=(196, 246), H=(292, 226),
        legs=[((150, 238), (106, 222)), ((152, 242), (108, 228))],
        arms=[((306, 226), (342, 212)), ((308, 232), (344, 220))],
        arrows=[("L", 344, 196, 344, 150), ("L", 104, 206, 104, 160)])),

    "penjac-polako": ("Penjač (polako)", dict(
        N=(252, 200), P=(170, 225),
        legs=[((128, 240), (86, 256)), ((214, 222), (184, 252))],
        arms=[((250, 230), (250, G)), ((256, 230), (258, G))],
        arrows=[("L", 112, 290, 214, 290, True)])),

    "bicikl": ("Bicikl", dict(
        N=(170, 220), P=(230, 248), H=(146, 204),
        legs=[((276, 240), (320, 228)), ((226, 200), (266, 196))],
        arms=[((178, 194), (156, 188)), ((206, 202), (162, 200))],
        arrows=[("Q", 196, 178, 214, 140, 232, 176, True)])),

    "medvedje-puzanje": ("Medveđe puzanje", dict(
        N=(256, 194), P=(176, 196),
        legs=[((196, 234), (142, G)), ((208, 232), (160, G))],
        arms=[((258, 226), (260, G)), ((270, 226), (282, G))],
        arrows=[("L", 166, 140, 280, 140, True)])),

    "rak-hodanje": ("Rak hodanje", dict(
        N=(150, 196), P=(222, 202), H=(134, 176),
        legs=[((262, 196), (268, G)), ((268, 198), (276, G))],
        arms=[((140, 228), (126, G)), ((146, 228), (134, G))],
        arrows=[("L", 150, 130, 280, 130, True)])),

    "gusenica": ("Gusenica", dict(
        N=(188, 214), P=(132, 160), H=(204, 232),
        legs=[((122, 208), (110, G)), ((126, 210), (116, G))],
        arms=[((212, 236), (234, G)), ((216, 238), (242, G))],
        arrows=[("L", 236, 290, 330, 290)])),

    "stajanje-jedna-noga": ("Stajanje na jednoj nozi", dict(
        N=(200, 86), P=(200, 162),
        legs=[((196, 212), (196, G)), ((228, 196), (216, 236))],
        arms=[((166, 120), (186, 156)), ((234, 120), (214, 156))],
        arrows=[("Q", 150, 40, 200, 4, 250, 40, True)])),

    "avion": ("Avion", dict(
        N=(276, 164), P=(200, 168),
        legs=[((154, 166), (108, 162)), ((202, 216), (202, G))],
        arms=[((306, 172), (340, 168)), ((310, 162), (344, 158))],
        arrows=[("Q", 222, 96, 272, 92, 304, 126)])),

    "mekani-poskoci": ("Mekani poskoci", dict(
        N=(200, 58), P=(200, 134),
        legs=[((198, 184), (196, 230)), ((204, 184), (206, 230))],
        arms=[((196, 92), (194, 124)), ((206, 92), (208, 124))],
        far_extra=[((196, 230), (208, 244))], near_extra=[((206, 230), (218, 244))],
        arrows=[("L", 268, 150, 268, 236, True)])),

    "tihi-cucanj-skok": ("Tihi čučanj sa skokom", dict(
        N=(204, 80), P=(196, 156),
        legs=[((216, 198), (198, 236)), ((222, 200), (204, 238))],
        arms=[((232, 100), (262, 92)), ((236, 104), (268, 98))],
        arrows=[("L", 112, 236, 112, 150)])),

    # --- napolju ---
    "cucanj-skok": ("Čučanj sa skokom", dict(
        N=(200, 70), P=(200, 146),
        legs=[((196, 192), (192, 236)), ((206, 192), (208, 236))],
        arms=[((182, 46), (168, 18)), ((218, 46), (232, 18))],
        arrows=[("L", 104, 250, 104, 130)])),

    "zvezdasti-skokovi": ("Zvezdasti skokovi", dict(
        N=(200, 84), P=(200, 154),
        legs=[((172, 196), (142, 236)), ((228, 196), (258, 236))],
        arms=[((166, 64), (136, 38)), ((234, 64), (264, 38))],
        arrows=[("Q", 110, 110, 96, 70, 118, 40), ("Q", 290, 110, 304, 70, 282, 40)])),

    "pajacovi": ("Pajacovi", dict(
        N=(200, 92), P=(200, 166),
        legs=[((176, 214), (150, G)), ((224, 214), (250, G))],
        arms=[((176, 62), (196, 36)), ((224, 62), (204, 36))],
        arrows=[("Q", 128, 150, 104, 84, 150, 46), ("Q", 272, 150, 296, 84, 250, 46)])),

    "klizacki-skokovi": ("Klizački skokovi", dict(
        N=(206, 104), P=(222, 176),
        legs=[((200, 214), (164, 238)), ((244, 212), (244, G))],
        arms=[((176, 124), (152, 146)), ((236, 124), (266, 112))],
        arrows=[("Q", 70, 244, 110, 150, 150, 214)])),

    "skok-u-dalj": ("Skok u dalj iz mesta", dict(
        N=(250, 98), P=(200, 152),
        legs=[((238, 178), (212, 218)), ((246, 180), (220, 222))],
        arms=[((280, 106), (312, 100)), ((284, 112), (316, 106))],
        arrows=[("L", 90, 290, 330, 290)])),

    "skok-sa-kolenima": ("Skok sa kolenima", dict(
        N=(200, 74), P=(200, 148),
        legs=[((180, 118), (174, 168)), ((220, 118), (226, 168))],
        arms=[((164, 94), (144, 116)), ((236, 94), (256, 116))],
        arrows=[("L", 312, 250, 312, 150)])),

    "zabji-skokovi": ("Žabji skokovi", dict(
        N=(222, 160), P=(172, 214),
        legs=[((226, 210), (190, G)), ((232, 214), (198, G))],
        arms=[((232, 196), (240, 240)), ((238, 198), (248, 242))],
        arrows=[("Q", 262, 130, 306, 50, 356, 134)])),

    "sprint": ("Sprint", dict(
        N=(212, 82), P=(194, 156),
        legs=[((172, 200), (136, 228)), ((236, 172), (222, 218))],
        arms=[((236, 112), (258, 96)), ((190, 114), (172, 142))],
        lines=[speed(118, 100), speed(110, 160)],
        arrows=[("L", 120, 290, 330, 290)])),

    "brza-stopala": ("Brza stopala", dict(
        N=(200, 92), P=(200, 166),
        legs=[((186, 214), (186, G)), ((218, 206), (214, 244))],
        arms=[((178, 126), (186, 152)), ((222, 126), (214, 152))],
        arrows=[("L", 282, 210, 282, 262, True), ("L", 118, 210, 118, 262, True)])),

    "penjac-brzo": ("Penjač (brzo)", dict(
        N=(252, 200), P=(170, 225),
        legs=[((128, 240), (86, 256)), ((214, 222), (184, 252))],
        arms=[((250, 230), (250, G)), ((256, 230), (258, G))],
        lines=[speed(78, 196, 3, 30, 12)],
        arrows=[("L", 112, 290, 214, 290, True)])),

    # placeholder for exercises he adds himself
    "nova-vezba": ("Nova vežba", dict(
        N=(200, 92), P=(200, 168),
        legs=[((190, 216), (182, G)), ((210, 216), (218, G))],
        arms=[((176, 64), (160, 34)), ((224, 64), (240, 34))],
        arrows=[])),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for slug, (title, pose) in POSES.items():
        with open(os.path.join(OUT, slug + ".svg"), "w", encoding="utf-8") as f:
            f.write(svg(title, pose))
    print(f"wrote {len(POSES)} images to {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()
