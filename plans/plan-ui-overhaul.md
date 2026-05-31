## Plan: UI Overhaul (Option 2)

Replace the old split workflow of Save Layout, Browse Server, Save to Server, Share, and prompt-based password entry with a single intelligent Save action and a dedicated Layout Manager. The planner remains local-first, but once a layout is linked to a server record, Save updates that same server layout directly.

## Goal

Make layout storage intuitive on desktop and mobile by reducing layout-related toolbar clutter, removing multi-step publish/update flows, and keeping local and server state aligned without changing the backend API contract.

## Scope

Included:
- Local layout metadata tracking
- Smart Save behavior
- Publish dialog
- Password dialog
- Layout Manager dialog
- Toolbar simplification
- Embedded frontend sync through `make embed`

Excluded:
- Backend API redesign
- Real-time multi-user sync
- Merge/conflict resolution
- Persistent credential storage

## Step-by-step Plan

### Phase 1: Metadata foundation

1. Add a `LAYOUT_STORAGE_KEY` constant in [assets/js/planner.js](assets/js/planner.js).
2. Add a `DEFAULT_LAYOUT_META` object with:
  - `serverLayoutId`
  - `serverLayoutName`
  - `hasServerPassword`
  - `lastServerSync`
3. Add runtime state for:
  - `layoutMeta`
  - `cachedServerPassword`
4. Add helper functions:
  - `normalizeLayoutMeta(meta)`
  - `getStoredLayoutData()`
  - `getLayoutMeta()`
  - `setLayoutMeta(updates)`
5. Update `saveLayout()` so it preserves `_meta` when rewriting the stored layout.
6. Update `loadLayout()` so it reads `_meta` when present and stays backward-compatible with legacy array/object payloads.
7. Update `clearLayout()` so it resets metadata and clears the cached password.

### Phase 2: New dialog surfaces

8. Replace the old server save dialog with a new `publishDialog` in [index.html](index.html).
9. Add a `passwordRequestDialog` to replace all `prompt()` password interactions.
10. Add a `layoutManagerDialog` that combines current-link status and server layout browsing.
11. Add matching DOM references in [assets/js/planner.js](assets/js/planner.js).
12. Add shared dialog feedback styling in [assets/css/style.css](assets/css/style.css):
  - `dialog-message`
  - `dialog-message.error`
  - `dialog-message.success`
  - `hidden`

### Phase 3: Smart Save workflow

13. Add `openPublishDialog(mode, prefillName)`.
14. Add `publishLayout(name, password)` using existing `POST /api/layouts/`.
15. Add `requestPassword(message, errorMessage)` returning a Promise-based modal result.
16. Add `updateLinkedLayout(id, password)` using existing `PUT /api/layouts/{id}`.
17. Add `smartSave()` with this behavior:
  - always call `saveLayout()` first
  - if not linked: open Publish dialog
  - if linked: try direct PUT update
  - if 403: request password and retry
  - if 404: unlink and reopen Publish flow
18. Add `updateSaveStatus()` so the toolbar reflects local-only or linked/synced state.

### Phase 4: Layout Manager

19. Add `openLayoutManager()`.
20. Add `refreshLayoutManager()` to fetch and render server layouts using existing `GET /api/layouts/`.
21. Add `renderLayoutManagerStatus()` to show the current linked layout and last sync time.
22. Add row actions for:
  - `Open`
  - `Save As`
  - `Delete`
23. Reuse `loadFromServer(id)` but extend it to write `_meta` after loading a server layout.
24. Add `unlinkLayout()` to remove server linkage from the local metadata.
25. Add `copyShareLink(id)` and `copyCurrentShareLink()` using the existing `?layout={id}` URL convention.

### Phase 5: Toolbar simplification

26. Replace the old toolbar buttons in [index.html](index.html):
  - remove `Save layout`
  - remove `Load layout`
  - remove `Browse Server`
  - remove `Save to Server`
  - remove `Share`
  - move export/import actions under a new `Layout` dropdown
27. Add a single primary `Save` button wired to `smartSave()`.
28. Add a `save-status` label next to Save.
29. Add a new `Layout` dropdown with:
  - Open from server
  - Reload local layout
  - Save As new server layout
  - Copy share link
  - Unlink from server
  - Export JSON
  - Import JSON
  - Export image
  - Clear layout
30. Add `toggleLayoutMenu()` and `closeToolbarMenus()` beside the existing add-menu logic.

### Phase 6: Backend-served frontend parity

31. Keep root frontend files as the canonical source.
32. Update [Makefile](Makefile) `embed` so copying root files into the embedded frontend preserves the backend-specific `window.__API_BASE__` placeholder behavior.
33. Run `make embed` after frontend changes.
34. Verify generated files under [backend/cmd/server/frontend](backend/cmd/server/frontend) match the root frontend, apart from the API-base placeholder substitution.

### Phase 7: Validation

35. Static validation:
  - check editor diagnostics for [assets/js/planner.js](assets/js/planner.js), [index.html](index.html), and [assets/css/style.css](assets/css/style.css)
  - repeat for the embedded frontend copies
36. Manual smoke test:
  - create layout and Save for first-time publish
  - save again after edits
  - test wrong-password retry
  - test unlink
  - test load from server
  - test share link copy and URL load
37. Dev-server validation:
  - run `make run`
  - open `http://localhost:8080`
  - test through the Go server, not by opening `index.html` directly

## Relevant Files

- [index.html](index.html) — toolbar structure and dialogs
- [assets/js/planner.js](assets/js/planner.js) — smart save, layout manager, metadata persistence
- [assets/css/style.css](assets/css/style.css) — toolbar and dialog styling
- [Makefile](Makefile) — embed sync for backend-served frontend
- [backend/cmd/server/frontend/index.html](backend/cmd/server/frontend/index.html) — generated embedded frontend
- [backend/cmd/server/frontend/assets/js/planner.js](backend/cmd/server/frontend/assets/js/planner.js) — generated embedded JS
- [backend/cmd/server/frontend/assets/css/style.css](backend/cmd/server/frontend/assets/css/style.css) — generated embedded CSS
- [backend/internal/api/handlers.go](backend/internal/api/handlers.go) — existing API contract, unchanged

## Verification Checklist

1. First Save on a local-only layout opens Publish.
2. Saving a linked layout updates the same server record directly.
3. Wrong password keeps the retry flow inside the modal.
4. Loading a server layout stores linkage metadata locally.
5. Clearing a layout removes linkage metadata.
6. Legacy local layouts still load.
7. Share URLs using `?layout=` still load correctly.
8. `make embed` regenerates backend-served frontend files correctly.

## Decisions

- Keep backend API unchanged.
- Keep localStorage as the source of truth for the current working layout.
- Cache a successful password in memory only for the current page session.
- Keep root frontend files canonical and derive embedded frontend files via `make embed`.

## Current Status

Implemented:
- Metadata-aware local storage
- Smart Save flow
- Publish dialog
- Password dialog
- Layout Manager dialog
- Simplified toolbar
- Embedded frontend sync support

Validated:
- Static diagnostics clean in root and embedded frontend files
- Manual frontend tests passed on the dev machine