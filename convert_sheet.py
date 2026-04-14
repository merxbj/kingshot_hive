#!/usr/bin/env python3
"""Convert Google Sheets CSV exports (Roster + Hive Layout) into planner JSON."""

import csv
import json
import sys

# ---------------------------------------------------------------------------
# 1. Read Roster
# ---------------------------------------------------------------------------
roster = {}  # key = name.lower(), value = dict

with open("roster.csv", encoding="utf-8") as f:
    reader = csv.reader(f)
    for row in reader:
        # Columns: [empty, Name, TC Level, Power, Power Last, Difference,
        #           Power Level, Rank, Bear Hunt Time, Seated, Notes]
        if len(row) < 9:
            continue
        name = row[1].strip()
        if not name or name == "Name":
            continue
        try:
            power = float(row[3])
        except ValueError:
            continue
        time_pref = row[8].strip() if len(row) > 8 else ""
        # Map time preference -> trap type (M=Morning, E=Evening, F=Flex)
        trap_map = {"Morning": "M", "Evening": "E", "Flex": "F", "N/A": "F"}
        trap = trap_map.get(time_pref, "F")
        roster[name.lower()] = {
            "name": name,
            "power": f"{power}M",
            "trap": trap,
            "rank": row[7].strip() if len(row) > 7 else "R1",
        }

print(f"Roster loaded: {len(roster)} players")

# ---------------------------------------------------------------------------
# 2. Read Hive Layout
# ---------------------------------------------------------------------------
with open("sheet_raw.csv", encoding="utf-8") as f:
    reader = csv.reader(f)
    rows = list(reader)

# Parse header row to get column-index → X-coordinate mapping
header = rows[0]
col_to_x = {}
for col_idx, val in enumerate(header):
    val = val.strip()
    if val:
        try:
            col_to_x[col_idx] = int(val)
        except ValueError:
            pass

min_x = min(col_to_x.values())  # 701
max_x = max(col_to_x.values())  # 777

# Collect Y values
y_values = []
for row in rows[1:]:
    if row[0].strip():
        try:
            y_values.append(int(row[0].strip()))
        except ValueError:
            pass

min_y = min(y_values)  # 567
max_y = max(y_values)  # 650

map_w = max_x - min_x + 1
map_h = max_y - min_y + 1
origin_x = min_x
origin_y = min_y

print(f"Map: {map_w}x{map_h}, origin ({origin_x}, {origin_y})")
print(f"X range: {min_x}-{max_x}, Y range: {min_y}-{max_y}")

# ---------------------------------------------------------------------------
# 3. Legend area to skip (bottom-left reference block)
# ---------------------------------------------------------------------------
LEGEND_X_MIN, LEGEND_X_MAX = 726, 736
LEGEND_Y_MIN, LEGEND_Y_MAX = 569, 578

def in_legend(x, y):
    return LEGEND_X_MIN <= x <= LEGEND_X_MAX and LEGEND_Y_MIN <= y <= LEGEND_Y_MAX

# ---------------------------------------------------------------------------
# 4. Values to skip (not castles)
# ---------------------------------------------------------------------------
SKIP_VALUES = {
    "B", "MOUNTAIN", "WATER", "Alliance Resource Blockage", "Plains HQ",
    "BT#1", "BT#2",
    "NW", "NE", "SW", "SE",
    "N/A", "Morning", "Evening", "Flex",
    "Poor", "Low", "Very Low", "Medium", "High", "Very High", "Exceptional",
    # Legend abbreviations
    "BV", "OB", "NB", "BC", "BD", "BI",
}

def is_numeric(s):
    try:
        float(s.replace("%", "").replace(",", ""))
        return True
    except ValueError:
        return False

# ---------------------------------------------------------------------------
# 5. Parse the grid
# ---------------------------------------------------------------------------
objects = []
used_names = set()

def logical_y(game_y, size):
    """Convert game-Y of an object's TOP row to planner logical-Y."""
    return game_y - origin_y - size + 1

def tile_x(game_x):
    return game_x - origin_x

for row in rows[1:]:
    if not row[0].strip():
        continue
    try:
        y = int(row[0].strip())
    except ValueError:
        continue

    for col_idx in range(1, len(row)):
        val = row[col_idx].strip()
        if not val:
            continue
        if col_idx not in col_to_x:
            continue

        x = col_to_x[col_idx]

        # --- Banner ---
        if val == "B":
            if in_legend(x, y):
                continue
            objects.append({
                "type": "banner", "name": "", "power": "", "trap": "F",
                "x": tile_x(x), "y": logical_y(y, 1),
            })

        # --- Mountain ---
        elif val == "MOUNTAIN":
            if in_legend(x, y):
                continue
            objects.append({
                "type": "mountain", "name": "", "power": "", "trap": "F",
                "x": tile_x(x), "y": logical_y(y, 1),
            })

        # --- Water ---
        elif val == "WATER":
            if in_legend(x, y):
                continue
            objects.append({
                "type": "water", "name": "", "power": "", "trap": "F",
                "x": tile_x(x), "y": logical_y(y, 1),
            })

        # --- Alliance Resource (2×2, cell = top-left) ---
        elif val == "Alliance Resource Blockage":
            if in_legend(x, y):
                continue
            objects.append({
                "type": "allianceresource", "name": "", "power": "", "trap": "F",
                "x": tile_x(x), "y": logical_y(y, 2),
            })

        # --- Plains HQ (3×3, cell = top-left) ---
        elif val == "Plains HQ":
            if in_legend(x, y):
                continue
            objects.append({
                "type": "plainshq", "name": "", "power": "", "trap": "F",
                "x": tile_x(x), "y": logical_y(y, 3),
            })

        # --- Bear Traps (3×3, cell = center) ---
        elif val in ("BT#1", "BT#2"):
            objects.append({
                "type": "trap", "name": "", "power": "", "trap": "F",
                "x": tile_x(x) - 1,          # center → left edge
                "y": logical_y(y, 1) - 1,     # center → bottom edge of 3×3
            })

        # --- Castle (2×2, name in top-left cell) ---
        elif val not in SKIP_VALUES and not is_numeric(val) and val.strip():
            key = val.lower()
            roster_entry = roster.get(key)
            if roster_entry and key not in used_names:
                used_names.add(key)
                objects.append({
                    "type": "castle",
                    "name": roster_entry["name"],
                    "power": roster_entry["power"],
                    "trap": roster_entry["trap"],
                    "rank": roster_entry.get("rank", "R1"),
                    "x": tile_x(x),
                    "y": logical_y(y, 2),
                })
            elif not roster_entry:
                # Unknown value – print for debugging
                print(f"  ? unmatched cell ({x},{y}): \"{val}\"")

# ---------------------------------------------------------------------------
# 6. Write JSON
# ---------------------------------------------------------------------------
result = {
    "origin": {"x": origin_x, "y": origin_y},
    "dimensions": {"w": map_w, "h": map_h},
    "objects": objects,
}

out_path = "kingshot_layout.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

# Summary
types = {}
for obj in objects:
    types[obj["type"]] = types.get(obj["type"], 0) + 1

print(f"\nWrote {out_path} with {len(objects)} objects:")
for t, c in sorted(types.items()):
    print(f"  {t}: {c}")

# Show which roster players were NOT placed
placed = {obj["name"].lower() for obj in objects if obj["type"] == "castle"}
missing = [r["name"] for k, r in roster.items() if k not in placed]
if missing:
    print(f"\nRoster players NOT found on hive ({len(missing)}):")
    for m in missing:
        print(f"  - {m}")
