# Deployment Checklist

All code implementation is now complete and pushed to your fork. This checklist covers the manual infrastructure and GitHub setup steps required to deploy the backend to Raspberry Pi and frontend to GitHub Pages.

## Progress

**Phase 1 — GitHub Setup**
- [x] 1.1 Enable GitHub Pages
- [x] 1.2 Create Production Environment
- [x] 1.3 Add Deployment Secrets to Production Environment
- [x] 1.4 Add Repo Variable for Pages Workflow

**Phase 2 — Raspberry Pi Setup**
- [x] 2.1 Prepare Pi Host
- [x] 2.2 Clone Repo and Prepare Deployment
- [x] 2.3 Create Persistent Data Directory
- [x] 2.4 Test Local Deployment
- [x] 2.5 Set Up Auto-Start on Boot

**Phase 3 — MikroTik Router Configuration**
- [x] 3.1 Add Destination NAT (Port Forwarding)
- [x] 3.2 Add Firewall Filter Rule (Allow Forwarded Traffic)
- [x] 3.3 Verify Port Forwarding
- [ ] 3.4 *(Optional)* Add Connection Limits for Abuse Prevention

**Phase 4 — GitHub Actions**
- [x] 4.1 Ensure Workflows Are Enabled
- [x] 4.2 Test Workflows

**Phase 5 — Verification**
- [x] 5.1 Backend Deployment Verification
- [x] 5.2 Frontend Deployment Verification
- [ ] 5.3 Full End-to-End Test

---

## Phase 1: GitHub Setup

### 1.1 Enable GitHub Pages

1. Go to your fork: https://github.com/merxbj/kingshot_hive
2. Navigate to **Settings → Pages**
3. Under "Build and deployment":
   - Source: **GitHub Actions**
4. Push to `main` (or manually run `deploy-frontend.yml`) and wait for the Pages workflow to complete
5. Optional CLI verification:
   - `gh api repos/merxbj/kingshot_hive/pages | cat`
   - Confirm `"build_type":"workflow"`

### 1.2 Create Production Environment

1. Go to **Settings → Environments**
2. Click **New environment**
3. Name it: `production`
4. Click **Configure environment**
5. Under "Deployment branches and tags":
   - Select: **Protected branches only** (or **Deployment branches**)

### 1.3 Add Deployment Secrets to Production Environment

1. In the `production` environment, scroll to **Secrets**
2. Add the following secrets by clicking **Add secret**:

| Secret Name | Value | Notes |
|---|---|---|
| `DEPLOY_HOST` | `<your-pi-ip>` | Pi's static IP on your LAN (e.g., 192.168.1.100) or public IP |
| `DEPLOY_USER` | `kingshot` | Non-root SSH user on Pi (you will create this) |
| `DEPLOY_SSH_KEY` | `<private-key>` | **Private SSH key** for the deploy user (no passphrase recommended) |
| `DEPLOY_PATH` | `/opt/kingshot` | Absolute path where you cloned the repo on Pi |
| `DEPLOY_PORT` | `22` | SSH port on Pi (change if non-standard, e.g. `25022`) |

**To generate SSH key pair:**
```bash
ssh-keygen -t ed25519 -f ~/.ssh/kingshot-deploy -N "" -C "kingshot-deploy"
cat ~/.ssh/kingshot-deploy       # Copy this as DEPLOY_SSH_KEY
cat ~/.ssh/kingshot-deploy.pub   # Copy this to Pi ~/.ssh/authorized_keys
```

### 1.4 Add Repo Variable for Pages Workflow

1. Go to **Settings → Secrets and variables → Actions**
2. Click **Variables**
3. Add the following variable:

| Variable Name | Value | Notes |
|---|---|---|
| `PROD_API_BASE` | `http://<your-public-ip>` | Your public IP or DDNS hostname (e.g., `http://203.0.113.50`); **not HTTPS for bare IP** |

---

## Phase 2: Raspberry Pi Setup

### 2.1 Prepare Pi Host

**Prerequisites on Pi:**
- Docker Engine installed
- Docker Compose plugin installed (v2+)
- Static LAN IP reserved (e.g., 192.168.1.100)
- SSH key-based login enabled
- SSH password login disabled

**Test SSH access from your dev machine:**
```bash
ssh -i ~/.ssh/kingshot-deploy kingshot@<pi-ip>
```

### 2.2 Clone Repo and Prepare Deployment

**On Pi, as the deploy user (`kingshot`):**

```bash
# Clone your fork to the deployment path
git clone https://github.com/merxbj/kingshot_hive.git /opt/kingshot
cd /opt/kingshot

# Checkout the branch (or wait for main to be pushed)
git checkout mexbik-dev  # or switch to main when ready

# Create the production env file
cp deploy/.env.prod.example deploy/.env.prod
```

**Edit `deploy/.env.prod` on Pi:**
```bash
nano deploy/.env.prod
```

Set these values:
```bash
PORT=8080
DB_PATH=/data/kingshot.db
CORS_ORIGIN=https://merxbj.github.io  # Your GitHub Pages URL
REQUIRE_CORS_ORIGIN=true
APP_ENV=production
```

Save and exit.

### 2.3 Create Persistent Data Directory

```bash
# On Pi, as kingshot user:
mkdir -p /opt/kingshot/data
```

### 2.4 Test Local Deployment

**On Pi, verify the stack can start:**

```bash
cd /opt/kingshot
docker compose -f deploy/compose.prod.yml pull
docker compose -f deploy/compose.prod.yml up -d
sleep 10
docker compose -f deploy/compose.prod.yml ps
```

**Verify health check passes:**
```bash
docker compose -f deploy/compose.prod.yml logs app | grep -i health
```

**Test API locally:**
```bash
curl http://127.0.0.1:8080/api/layouts
```

If all returns `[]`, deployment is working. Stop the stack:
```bash
docker compose -f deploy/compose.prod.yml down
```

### 2.5 Set Up Auto-Start on Boot

Create a systemd service file so the stack restarts after reboot:

**On Pi, as root or with sudo:**

```bash
sudo tee /etc/systemd/system/kingshot.service > /dev/null <<EOF
[Unit]
Description=Kingshot Hive Backend
After=docker.service
Requires=docker.service

[Service]
User=kingshot
WorkingDirectory=/opt/kingshot
ExecStart=/usr/bin/docker compose -f deploy/compose.prod.yml up
ExecStop=/usr/bin/docker compose -f deploy/compose.prod.yml down
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable kingshot
sudo systemctl start kingshot
sudo systemctl status kingshot
```

---

## Phase 3: MikroTik Router Configuration

### 3.1 Add Destination NAT (Port Forwarding)

**Assumption:** Pi LAN IP is `192.168.1.100`, your public IP is `203.0.113.50`, port 80.

**On MikroTik:**

1. Go to **IP → Firewall → NAT**
2. Click **+ Add new**
3. Set the following:

| Field | Value |
|---|---|
| Chain | `dstnat` |
| Protocol | `tcp` |
| Dst. Port | `80` |
| In. Interface | `ether1` (or your WAN interface) |
| — **Action** → | — |
| Action | `dst-nat` |
| To Addresses | `192.168.1.100` |
| To Ports | `80` |

4. Click **OK**

### 3.2 Add Firewall Filter Rule (Allow Forwarded Traffic)

1. Go to **IP → Firewall → Filter Rules**
2. Click **+ Add new**
3. Set the following:

| Field | Value |
|---|---|
| Chain | `forward` |
| In. Interface | `ether1` (WAN) |
| Out. Interface | `bridge` (or LAN bridge) |
| Protocol | `tcp` |
| Dst. Port | `80` |
| — **Action** → | — |
| Action | `accept` |

4. Click **OK**

### 3.3 Verify Port Forwarding

**From any external network (not your LAN), test:**

```bash
curl http://203.0.113.50/api/layouts
```

Should return `[]` or an error; if connection refused, check firewall rules and NAT.

### 3.4 (Optional) Add Connection Limits and Address Lists for Abuse Prevention

**On MikroTik, add connection limit rule:**

1. Go to **IP → Firewall → Filter Rules**
2. Add a rule **before** the `80` accept rule:

| Field | Value |
|---|---|
| Chain | `forward` |
| Protocol | `tcp` |
| Dst. Port | `80` |
| Connection Limit | `100,32` (100 concurrent connections per /32) |
| — **Action** → | |
| Action | `drop` |
| Comment | `Limit connections to port 80` |

---

## Phase 4: Enable GitHub Actions Workflows

### 4.1 Ensure Workflows Are Enabled

1. Go to your fork **Settings → Actions → General**
2. Under "Actions permissions", select: **Allow all actions and reusable workflows**
3. Click **Save**

### 4.2 Test Workflows

**Option A: Push to `main` to trigger auto-deploy**

```bash
# On your dev machine:
git checkout main
git merge mexbik-dev
git push origin main
```

This will trigger:
- `Backend CI and Deploy` (build, push image to GHCR, SSH deploy to Pi)
- `Deploy Frontend to GitHub Pages` (build static site, push to Pages)

**Option B: Manually trigger via `workflow_dispatch`**

1. Go to **Actions**
2. Select **Deploy Frontend to GitHub Pages**
3. Click **Run workflow**

---

## Phase 5: Verification

### 5.1 Backend Deployment Verification

**Check GitHub Actions:**
1. Go to **Actions → Backend CI and Deploy**
2. Wait for the workflow to complete (should see green checkmark)
3. Check the `deploy` job logs for SSH output

**Check Pi:**
```bash
ssh kingshot@<pi-ip> docker compose -f /opt/kingshot/deploy/compose.prod.yml ps
```

Should show both `kingshot-app` and `kingshot-proxy` with status `Up`.

### 5.2 Frontend Deployment Verification

1. Go to **Actions → Deploy Frontend to GitHub Pages**
2. Wait for workflow to complete
3. Navigate to: `https://merxbj.github.io/kingshot_hive/`
4. Planner should load
5. Confirm frontend markers in page source:
   - `window.__API_BASE__` contains your deployed API URL
   - `window.__DEBUG_VERSION__` shows the expected version marker
6. Click **Browse Server** → should connect to backend at your public IP

### 5.3 Full End-to-End Test

1. Open: `https://merxbj.github.io/kingshot_hive/`
2. Create a layout locally
3. Click **Save to Server**
4. Click **Browse Server** and load the saved layout
5. Share the layout and test the share link

**Current status:** blocked if `PROD_API_BASE` is plain HTTP (for example `http://84.19.72.85`) while Pages runs on HTTPS.

Browsers enforce mixed-content rules and will block API requests from:
- `https://merxbj.github.io/kingshot_hive/` → `http://...`

To complete end-to-end testing, backend API must be available over HTTPS:
1. Add a domain (or subdomain) pointing to your public IP
2. Terminate TLS on the Pi (for example Caddy or Nginx with Let's Encrypt)
3. Set `PROD_API_BASE` to `https://<your-domain>`
4. Re-run `deploy-frontend.yml` and test Save/Browse again

---

## Phase 6: Troubleshooting Quick Reference

| Issue | Diagnosis | Fix |
|---|---|---|
| Pages site 404 | Workflow didn't run | Check Actions logs; ensure `main` exists; manually trigger deploy-frontend |
| Pages shows raw placeholders (for example `__PROD_API_BASE__`) | Pages source set to legacy branch deployment | In Settings → Pages set Source to GitHub Actions; verify `build_type` is `workflow` via `gh api repos/<owner>/<repo>/pages` |
| Backend API unreachable from Pages | CORS or network issue | Check `CORS_ORIGIN` in `deploy/.env.prod`; verify firewall/NAT |
| Mixed Content error in browser console | Frontend is HTTPS but `PROD_API_BASE` is HTTP | Serve API over HTTPS (domain + TLS), update `PROD_API_BASE`, redeploy frontend |
| Deploy workflow fails | SSH key or host unreachable | Test `ssh -i key kingshot@host` from GH runner context; add to known_hosts |
| Pi service won't start | Image pull failed | Check GHCR auth; verify image tag in deploy output; check Docker logs |
| Rate limiting error | Too many write requests | Expected if testing; will reset; check rate limiter in handlers.go |

---

## Next Steps

1. **Complete GitHub Setup** (Phase 1)
2. **Prepare Raspberry Pi** (Phase 2)
3. **Configure MikroTik** (Phase 3)
4. **Enable and Test Workflows** (Phase 4 & 5)
5. **(Optional) Set up monitoring, backups, and DDNS** (see deployment plan for long-term hardening)

For questions, refer to [plan-deployment.md](plans/plan-deployment.md) for full context.
