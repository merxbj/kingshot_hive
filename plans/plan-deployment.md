## Plan: Raspberry Pi + MikroTik + GitHub Pages Deployment

Deploy backend on Raspberry Pi using Docker with automated GitHub Actions CD, expose only required traffic through MikroTik, apply layered hardening on host/router/app, and deploy frontend to GitHub Pages with a separate workflow. Start with hardcoded public IP support, while keeping a near-term path to free DDNS for proper TLS.

**Steps**
1. Phase 0 - Preconditions and risk acceptance
1. Confirm Raspberry Pi host baseline: Docker Engine, Docker Compose plugin, SSH key-only access, static LAN IP reservation, and reliable storage for SQLite (USB SSD preferred over SD card).
1. Record current constraints: no registered domain, public static IP available, frontend on GitHub Pages, backend public API.
1. Explicitly accept that hardcoded IP mode is temporary because trusted HTTPS on bare IP is limited and operationally brittle.

2. Phase 1 - Backend runtime on Raspberry Pi (depends on 1)
1. Create production compose stack for Pi with restart policy, healthcheck, persistent volume for DB, log rotation, and env file separation.
1. Ensure backend environment includes strict CORS origin for GitHub Pages origin, DB path on persistent storage, and write-safe SQLite settings.
1. Add a reverse proxy layer in front of backend so only one public listener is exposed and backend container stays on private Docker network.
1. Verify backend service starts on boot and auto-recovers on crash.

3. Phase 2 - Backend CI/CD from GitHub Actions (parallel with 4 after 2.1)
1. Add workflow to lint, test, build multi-arch image (arm64 at minimum), and push image to container registry.
1. Add deploy job triggered on push to main: SSH to Raspberry Pi, pull latest image, run compose up, keep previous image for rollback.
1. Add manual workflow dispatch for emergency redeploy/rollback.
1. Store deployment secrets in GitHub environments: SSH private key, host/IP, deploy user, optional registry token.

4. Phase 3 - MikroTik router minimum-exposure policy (depends on 2)
1. Keep default drop policy for unsolicited inbound traffic.
1. Add destination NAT only for required public port(s) to reverse proxy host on Pi LAN IP.
1. Do not expose backend container port directly; publish only proxy port(s).
1. Add firewall filter rules allowing only established/related and explicit forwarded backend traffic; drop and log invalid/new unmatched traffic.
1. Add simple abuse controls at router level: connection limits and optional address-list temporary bans for obvious scan bursts.

5. Phase 4 - Hardening for host, containers, and app (depends on 2 and 4)
1. Host hardening: disable password SSH login, non-root admin user, unattended security updates, minimal open services, and local firewall allowing only SSH from admin network plus proxy ports.
1. Container hardening: run as non-root, read-only filesystem where possible, drop unused Linux capabilities, pin image tags/digests.
1. App hardening: keep request body limit, write-rate limiting, parameterized SQL, strict CORS, secure headers at proxy, and fail-closed env validation on startup.
1. Data protection: nightly SQLite backup plus weekly restore test to a separate file path.
1. Observability: add structured logs and a lightweight health endpoint for uptime checks.

6. Phase 5 - Frontend GitHub Pages deployment with CI/CD (parallel with 2 after API URL decision)
1. Add frontend workflow to deploy static site to GitHub Pages on push to main.
1. Introduce environment-specific frontend config so production API endpoint is injected at deploy time.
1. In temporary hardcoded mode, set API base to public IP endpoint and keep share links on Pages URL with query parameter.
1. Keep same-origin local development behavior unchanged.

7. Phase 6 - Hardcoded IP handling and migration path (depends on 5)
1. Temporary mode: use hardcoded public IP endpoint in frontend production config.
1. Document operational caveats: certificate trust limitations, future endpoint change impact, and browser mixed-content restrictions.
1. Planned upgrade path: switch API endpoint to free DDNS hostname, enable trusted TLS, update CORS allowlist and frontend config without changing API contract.

8. Phase 7 - Verification and acceptance (depends on 2, 4, 5, 6)
1. Backend deploy verification: container healthy after reboot, DB persists across restart, and API read/write/delete behaviors match expected auth rules.
1. Router verification: external scan shows only intended public port(s), no direct backend port exposure.
1. Security verification: CORS allows GitHub Pages origin only, write rate limiting triggers under burst tests, SSH password auth denied.
1. Frontend verification: GitHub Pages site loads, can create/share/load layouts through backend, and share URL with layout query works end-to-end.
1. Recovery verification: perform restore drill from latest backup and validate app functionality.

**Relevant files**
- /home/mexbik/git/kingshot_hive/.github/workflows/ci.yml - existing CI baseline to split into build-and-push plus deploy stages.
- /home/mexbik/git/kingshot_hive/docker-compose.yml - base runtime definition to derive a production compose stack for Raspberry Pi.
- /home/mexbik/git/kingshot_hive/Dockerfile - align with multi-arch and runtime hardening expectations.
- /home/mexbik/git/kingshot_hive/backend/cmd/server/main.go - startup env validation, CORS origin handling, and optional health route wiring.
- /home/mexbik/git/kingshot_hive/backend/internal/api/handlers.go - existing rate limiting and CORS middleware to preserve and tighten.
- /home/mexbik/git/kingshot_hive/assets/js/planner.js - production API base configuration and share-link behavior for Pages deployment.
- /home/mexbik/git/kingshot_hive/index.html - static frontend entrypoint used by GitHub Pages.

**Verification**
1. Run backend CI checks on each push: lint, tests, image build for arm64.
1. Confirm deploy workflow updates Pi service automatically on main and supports manual rollback.
1. Validate from external network that only intended public port(s) respond.
1. Validate full functional flow from GitHub Pages: create layout, list layouts, open share link with layout query.
1. Validate nightly backup artifact creation and monthly restore test completion.

**Decisions**
- Included scope: Raspberry Pi backend deployment, GitHub Actions CD, MikroTik exposure controls, security hardening, and GitHub Pages frontend deployment.
- Excluded scope: purchasing a registered domain now.
- Constraint: production endpoint initially uses hardcoded public IP, with planned DDNS migration for stronger TLS posture.
- Recommendation: because host OS is Raspbian 10 Buster (EOL), schedule OS upgrade to a supported release before public exposure.

**Further Considerations**
1. TLS path recommendation: Option A keep hardcoded IP temporarily with strict firewall and short timeline, Option B move immediately to free DDNS hostname for trusted HTTPS.
2. Rollback strategy recommendation: Option A keep previous container image on Pi and one-click compose rollback, Option B add immutable release tags and deploy by tag.
3. Backup target recommendation: Option A second local disk on Pi, Option B encrypted off-device copy to another host.