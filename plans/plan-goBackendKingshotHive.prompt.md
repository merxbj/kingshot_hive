# Plan: Go Backend for Kingshot Hive Planner

This adds a stateless Go REST API backed by SQLite, containerized with Docker, with a GitHub Actions CI pipeline. The frontend gains a "Server Layouts" modal and share-link support. The Go binary can optionally embed and serve the frontend itself, supporting both same-origin deployment and GitHub Pages + separate API deployment.

---

## Storage Recommendation: SQLite via `modernc.org/sqlite`

**Why SQLite:**
- Pure Go, no CGO — Docker multi-stage builds work cleanly, no cross-compilation headaches
- Zero external process — single `.db` file, trivially backed up with `cp`
- Volume-mounted in Docker for persistence across container restarts
- Excellent read performance (this workload is overwhelmingly reads)
- **Migration path**: wrap the store in a `Store` interface from day one → swap to PostgreSQL later by replacing just one file

Alternatives considered: PostgreSQL (overengineered: needs a separate container, connection pool config), BoltDB (pure Go but no SQL querying), Redis (not durable primary storage).

---

## API Design (5 endpoints)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/layouts` | — | List layouts (id, name, dates, `has_password`) |
| `GET` | `/api/layouts/{id}` | — | Fetch a layout's full JSON |
| `POST` | `/api/layouts` | — | Create layout (optional password) |
| `PUT` | `/api/layouts/{id}` | password in body | Update layout data |
| `DELETE` | `/api/layouts/{id}` | password in body | Delete layout |

Share links work purely on the frontend: `/?layout={id}` → JS detects the query param → fetches from API → stores in localStorage → planner renders it. No extra server route needed.

---

## DB Schema

```sql
CREATE TABLE layouts (
  id            TEXT PRIMARY KEY,   -- UUID v4
  name          TEXT NOT NULL,
  data          TEXT NOT NULL,      -- full layout JSON
  password_hash TEXT,               -- bcrypt(cost=12), NULL = no password
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## Project Structure

New files in **bold**, existing files modified noted:

```
kingshot_hive/
├── backend/
│   ├── cmd/server/main.go           # entrypoint; embeds frontend via //go:embed
│   ├── internal/
│   │   ├── api/handlers.go          # chi router + all HTTP handlers
│   │   ├── store/sqlite.go          # Store interface + SQLite impl
│   │   └── models/layout.go        # Layout, ListItem structs
│   └── go.mod / go.sum
├── Dockerfile                       # multi-stage: build → minimal alpine runtime
├── docker-compose.yml               # single service, /data volume, env vars
└── .github/workflows/ci.yml         # lint → test → build → docker build
```

Modified: `assets/js/planner.js` (API functions + query param detection + shareLayout update), `index.html` (server layouts modal + toolbar button).

---

## Implementation Steps

### Phase 1 — Backend (sequential)

1. Create `backend/go.mod` — deps: `go-chi/chi`, `modernc.org/sqlite`, `google/uuid`, `golang.org/x/crypto`
2. Create `backend/internal/models/layout.go` — structs with JSON tags
3. Create `backend/internal/store/sqlite.go` — `Store` interface + migration-on-start + 5 CRUD methods with bcrypt verify
4. Create `backend/internal/api/handlers.go` — chi router, CORS middleware, 5 handlers, size limit (1 MB), rate limiter on writes
5. Create `backend/cmd/server/main.go` — `//go:embed` the frontend, read `PORT` / `DB_PATH` / `CORS_ORIGIN` from env, wire everything

### Phase 2 — Containerization *(parallel with Phase 3)*

6. `Dockerfile` — multi-stage: `golang:1.22-alpine` → `alpine:latest`, copy binary only
7. `docker-compose.yml` — port mapping, `./data:/data` volume, env vars

### Phase 3 — CI/CD *(parallel with Phase 2)*

8. `.github/workflows/ci.yml` — jobs: `lint` (golangci-lint), `test` (`go test ./...`), `build`, `docker build`; optional `deploy` job (SSH + `docker compose pull && up`) gated to `main` pushes only

### Phase 4 — Frontend *(depends on Phase 1 API being designed)*

9. `planner.js` — add `API_BASE` constant, `loadFromServer()`, `listServerLayouts()`, `saveToServer()`, `updateOnServer()`, `deleteFromServer()`; `DOMContentLoaded` query-param check; update `shareLayout()` to use own backend
10. `index.html` — add "Browse Server" toolbar button + modal (table of layouts, load/delete actions, password prompt dialogs); add "Save to Server" form (name + optional password)

---

## Security Controls

- Passwords: bcrypt cost 12, never returned in any response
- Per-request stateless password verification (no sessions)
- CORS: explicit origin allowlist, not `*`
- All SQL via parameterized queries
- Layout body size capped at 1 MB
- Rate limiting on `POST`/`PUT`/`DELETE`

---

## Verification

1. `go test ./...` passes
2. `docker build` succeeds cleanly
3. `GET /api/layouts` returns `[]` on fresh DB
4. Full round-trip: POST → GET → verify data matches
5. POST with password → DELETE without password → `403`; DELETE with correct password → `204`
6. Open `/?layout={id}` → planner loads from server (not localStorage)
7. `shareLayout()` produces `/?layout={id}`, not a catbox.moe URL
8. GitHub Actions pipeline is green

---

## Decisions Captured

- Deployment: Docker on VPS
- Frontend hosting: flexible; Go backend embeds frontend by default (single-binary deployment), CORS enabled so GitHub Pages still works
- Layouts publicly readable; password gates writes/deletes only
- Share link overwrites current localStorage layout and displays immediately
