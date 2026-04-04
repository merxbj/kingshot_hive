# Kingshot Hive Planner

A visual planning tool for **Kingshot alliance hive and trap events**.

This planner helps organize player and building positioning on a fully configurable grid map, with power-based player analysis, territory overlays, and flexible layout management.

---

## Live Version
🔗 **Live tool:** https://atom-d.github.io/kingshot_hive/

---

## Screenshot
<p align="center">
  <img src="docs/planner.jpg" width="900">
</p>

---

## Features

- Grid-based **drag & drop map**
- Place and move:
  - Castles
  - Banners
  - Plains HQ
  - Bear traps
  - Alliance Resources
  - Water tiles
  - Mountain tiles
- **Territory overlay** — banners project a 7×7 covered area, Plains HQ projects an 11×11 covered area, visualised as a light overlay on the map
- **Configurable map** — set custom width, height, and coordinate origin via Map Settings
- **X/Y coordinate axes** with origin offset (Y-axis points up)
- Click any object to **select** it and highlight its logical coordinates on the axes
- **Right-click context menu** — on an empty tile: add any object type; on an occupied tile: Edit or Delete
- **Automatic player power analysis**
- Player list sorted by strength
- Visual **power tier color system**
- Trap assignment indicator on castles
- Highlight player ↔ castle selection; click a player to scroll the map to their castle
- Save / load layout locally
- Export / import layout JSON
- Export player list to CSV
- Zoom levels (75–200%)
- Export map as image (PNG) for easy sharing

---

## Power Tier System

Player strength is calculated relative to the **average alliance power**.

| Level | Relative Power |
|------|------|
| Exceptional | ≥150% |
| Very High | ≥130% |
| High | ≥115% |
| Medium | ≥100% |
| Low | ≥85% |
| Very Low | ≥70% |
| Poor | <70% |

Castles and player list entries are automatically colored based on this tier.

---

## Controls

### Mouse

| Action | Result |
|--------|--------|
| Drag | Move objects |
| Right-click (empty tile) | Open add-object menu |
| Right-click (object) | Edit or Delete |
| Click player in list | Scroll map to their castle |

### Toolbar

| Button | Result |
|--------|--------|
| **Add ▾** | Dropdown to add any object type |
| **Map settings** | Configure width, height, and origin |
| **Save / Load layout** | Persist to browser localStorage |
| **Export / Import layout** | JSON file |
| **Export player list** | CSV file |
| **Export image** | PNG screenshot of the map |
| **75% … 200%** | Zoom levels |

---

## Map Objects

| Object | Size | Notes |
|--------|------|-------|
| Castle | 2×2 | Holds player name, power, trap assignment |
| Banner | 1×1 | Projects 7×7 territory |
| Plains HQ | 3×3 | Projects 11×11 territory |
| Alliance Resource | 2×2 | No special attributes |
| Bear Trap | 3×3 | Two traps maximum |
| Water | 1×1 | Terrain marker |
| Mountain | 1×1 | Terrain marker |

---

## Coordinate System

- Origin is configurable via **Map Settings**
- X grows to the right, Y grows upward
- Object coordinates refer to the **bottom-left tile** of the object's footprint
- Axes are displayed around the map and update when origin or dimensions change

---

## Layout Storage

The planner supports multiple persistence options:

- **Save layout** → browser localStorage
- **Load layout** → browser localStorage
- **Export layout** → JSON file
- **Import layout** → JSON file
- **Export player list** → CSV

Layout JSON format:
```json
{
  "origin": { "x": 0, "y": 0 },
  "dimensions": { "w": 40, "h": 25 },
  "objects": [
    { "type": "castle", "name": "PlayerName", "power": "150M", "trap": "T1", "x": 10, "y": 8 },
    { "type": "banner", "name": "", "power": "", "trap": "F", "x": 5, "y": 5 }
  ]
}
```

---

## File Structure

```
kingshot_hive
│
├─ index.html
├─ README.md
│
├─ assets
│   ├─ css
│   │   └─ style.css
│   │
│   └─ js
│       └─ planner.js
│
└─ docs

    └─ planner.jpg
```

---

## Running the Planner

Simply open `index.html` in any modern browser.

No server or installation required.

---

## Tech Stack

- Vanilla JavaScript
- HTML5
- CSS3
- Browser localStorage
- html2canvas (image export)

No frameworks required.

---

## License

Personal project. Free to use and modify.
