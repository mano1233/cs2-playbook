"""
Builds src/data/callouts.json from CS2 demos.

Where the names come from. CS2 no longer keeps place names in the nav mesh — they are
entities compiled into the map — but every demo records, for every player on every
tick, the place the game itself says they are standing in (`last_place_name`, the text
on the HUD under the radar). Sampling that over a few matches gives Valve's own callouts
in Source world units, the same frame this app stores every position in. No guessing,
no hand-drawn polygons.

Output per map:

  places   the raw names ("BombsiteA", "TSpawn"); the app formats them for display
  labels   one anchor per place and radar level, inside the place, for drawing a name
  cells    a sparse 3-D grid of CELL x CELL x ZCELL units, each the place most seen in
           it — what "which callout is this getpos in" is answered from

Coverage is whatever maps the demos cover: a map nobody has played has no callouts
until a demo of it exists. Rerun after adding demos; the output is deterministic.

Run with the cs2-demos virtualenv, which already has demoparser2 and pandas:

  ../cs2-demos/.venv/Scripts/python scripts/extract-callouts.py [demo dirs...]

With no arguments it reads ~/cs2-demos and the Steam replays folder.
"""

import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

from demoparser2 import DemoParser

ROOT = Path(__file__).resolve().parent.parent
RADARS = json.loads((ROOT / "src/data/radars.json").read_text())
OUT = ROOT / "src/data/callouts.json"

CELL = 64  # world units; a radar pixel is 5-7, a player about 32 wide
ZCELL = 96  # Nuke stacks Heaven over Hell ~290 units apart; this keeps them apart
EVERY = 32  # sample every 32nd tick: ~2 per second at 64 tick, plenty for a map
MIN_SAMPLES = 2  # a cell seen once is more likely a jump or a fall than a place

DEFAULT_DIRS = [
    Path.home() / "cs2-demos",
    Path(r"C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\replays"),
]


def level_for_z(map_name: str, z: float) -> str:
    """Mirrors levelForZ in src/lib/radar.ts, so a label lands on the radar it belongs to."""
    levels = RADARS[map_name]["levels"]
    for lv in levels:
        if lv["altitudeMin"] is None or lv["altitudeMax"] is None:
            continue
        if lv["altitudeMin"] < z <= lv["altitudeMax"]:
            return lv["id"]
    banded = [lv for lv in levels if lv["altitudeMin"] is not None]
    return min(banded, key=lambda lv: lv["altitudeMin"])["id"] if banded else "default"


def samples(dem: Path):
    parser = DemoParser(str(dem))
    map_name = parser.parse_header().get("map_name")
    if map_name not in RADARS:
        return map_name, None
    last = int(parser.parse_ticks(["tick"]).tick.max())
    df = parser.parse_ticks(["X", "Y", "Z", "last_place_name"], ticks=list(range(0, last, EVERY)))
    df = df[df.last_place_name.notna() & (df.last_place_name != "")]
    return map_name, df[["X", "Y", "Z", "last_place_name"]]


def main(dirs: list[Path]) -> None:
    demos = sorted({p.resolve() for d in dirs if d.is_dir() for p in d.glob("*.dem")})
    per_map: dict[str, list] = defaultdict(list)
    counted: Counter = Counter()

    for dem in demos:
        try:
            map_name, df = samples(dem)
        except Exception as err:  # a truncated download is common; skip it, say so
            print(f"skip {dem.name}: {err}", file=sys.stderr)
            continue
        if df is None:
            print(f"skip {dem.name}: no radar calibration for {map_name}", file=sys.stderr)
            continue
        per_map[map_name].append(df)
        counted[map_name] += 1

    out = {}
    for map_name in sorted(per_map):
        rows = [r for df in per_map[map_name] for r in df.itertuples(index=False)]

        votes: dict[tuple[int, int, int], Counter] = defaultdict(Counter)
        for x, y, z, place in rows:
            votes[(math.floor(x / CELL), math.floor(y / CELL), math.floor(z / ZCELL))][place] += 1

        places = sorted({p for c in votes.values() for p in c})
        index = {p: i for i, p in enumerate(places)}
        cells = []
        for (ix, iy, iz), c in sorted(votes.items()):
            place, n = c.most_common(1)[0]
            if n >= MIN_SAMPLES:
                cells.append([ix, iy, iz, index[place]])

        # A label goes on the cell of that place nearest its median position — so it
        # sits inside the place even when the place is L-shaped and its mean is not.
        by_place_level: dict[tuple[int, str], list] = defaultdict(list)
        for ix, iy, iz, pi in cells:
            cx, cy, cz = (ix + 0.5) * CELL, (iy + 0.5) * CELL, (iz + 0.5) * ZCELL
            by_place_level[(pi, level_for_z(map_name, cz))].append((cx, cy, cz))
        labels = []
        for (pi, level), pts in sorted(by_place_level.items()):
            if len(pts) < 3:  # a sliver of a place seen from the other floor
                continue
            mx = sorted(p[0] for p in pts)[len(pts) // 2]
            my = sorted(p[1] for p in pts)[len(pts) // 2]
            x, y, z = min(pts, key=lambda p: (p[0] - mx) ** 2 + (p[1] - my) ** 2)
            labels.append({"place": pi, "x": x, "y": y, "z": z, "level": level})

        out[map_name] = {
            "demos": counted[map_name],
            "cell": CELL,
            "zcell": ZCELL,
            "places": places,
            "labels": labels,
            "cells": cells,
        }
        print(f"{map_name}: {counted[map_name]} demos, {len(places)} places, {len(cells)} cells")

    # Keep maps from an earlier run that this run had no demos for: losing Mirage's
    # callouts because its demo was cleaned up would be a regression nobody asked for.
    previous = json.loads(OUT.read_text()) if OUT.exists() else {}
    merged = {**previous, **out}
    OUT.write_text(json.dumps(merged, separators=(",", ":"), sort_keys=True) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB, {len(merged)} maps)")


if __name__ == "__main__":
    main([Path(a) for a in sys.argv[1:]] or DEFAULT_DIRS)
