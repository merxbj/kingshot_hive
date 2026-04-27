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

**Phase 3 — GitHub Actions**
- [x] 3.1 Ensure Workflows Are Enabled
- [x] 3.2 Test Workflows

**Phase 4 — Verification and HTTPS Setup**
- [x] 4.1 Backend Deployment Verification
- [x] 4.2 Frontend Deployment Verification
- [x] 4.3 Full End-to-End Test

**Phase 4A - HTTPS via Cloudflare Quick Tunnel**
- [x] 4A.1 Install `cloudflared` on Pi
- [x] 4A.2 Set up Quick Tunnel as systemd service
- [x] 4A.3 Extract Quick Tunnel URL and update `PROD_API_BASE`
- [x] 4A.4 Verify end-to-end save/load functionality

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
| `PROD_API_BASE` | `https://placeholder.trycloudflare.com` | **Temporary placeholder.** Will be updated in Phase 4A after Quick Tunnel is set up. The value must be an HTTPS URL to avoid mixed-content blocking from the Pages frontend. |

**Note:** The actual Quick Tunnel URL will be obtained in Phase 4A (after installing and configuring cloudflared on the Pi). You can update this variable then using the helper script: `./scripts/sync_quick_tunnel_api_base.sh --pi-host <PI_IP>`

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

## Phase 3: Enable GitHub Actions Workflows

### 3.1 Ensure Workflows Are Enabled

1. Go to your fork **Settings → Actions → General**
2. Under "Actions permissions", select: **Allow all actions and reusable workflows**
3. Click **Save**

### 3.2 Test Workflows

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

## Phase 4: Verification

### 4.1 Backend Deployment Verification

**Check GitHub Actions:**
1. Go to **Actions → Backend CI and Deploy**
2. Wait for the workflow to complete (should see green checkmark)
3. Check the `deploy` job logs for SSH output

**Check Pi:**
```bash
ssh kingshot@<pi-ip> docker compose -f /opt/kingshot/deploy/compose.prod.yml ps
```

Should show both `kingshot-app` and `kingshot-proxy` with status `Up`.

### 4.2 Frontend Deployment Verification

1. Go to **Actions → Deploy Frontend to GitHub Pages**
2. Wait for workflow to complete
3. Navigate to: `https://merxbj.github.io/kingshot_hive/`
4. Planner should load
5. Confirm frontend markers in page source:
   - `window.__API_BASE__` contains your deployed API URL
   - `window.__DEBUG_VERSION__` shows the expected version marker
6. Click **Browse Server** → should connect to backend at your public IP

### 4.3 Full End-to-End Test

1. Open: `https://merxbj.github.io/kingshot_hive/`
2. Create a layout locally
3. Click **Save to Server**
4. Click **Browse Server** and load the saved layout
5. Share the layout and test the share link

**Note:** Full end-to-end testing requires HTTPS on the API endpoint (to avoid mixed-content blocking). This is provided by the Cloudflare Quick Tunnel service configured in Phase 4A.

### 4A: Cloudflare Quick Tunnel (No domain/account required)

Cloudflare Quick Tunnel provides a stable HTTPS endpoint for the backend API without requiring a domain or Cloudflare account. The tunnel runs as a systemd service on the Pi, automatically restarting on reboot.

#### 4A.1 Install cloudflared on Pi

**On Pi, as root or with sudo:**

```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update
sudo apt install -y cloudflared
cloudflared --version
```

#### 4A.2 Set Up Quick Tunnel as systemd service

**On Pi, as root or with sudo:**

```bash
sudo tee /etc/systemd/system/kingshot-quicktunnel.service > /dev/null <<EOF
[Unit]
Description=Kingshot Quick Cloudflare Tunnel
After=network-online.target
Wants=network-online.target

[Service]
User=kingshot
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:80
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable kingshot-quicktunnel
sudo systemctl restart kingshot-quicktunnel
sudo systemctl status kingshot-quicktunnel
```

The tunnel will generate a new `https://*.trycloudflare.com` URL each time it starts. Check the logs:

```bash
sudo journalctl -u kingshot-quicktunnel -n 20 -f
```

Look for a line like: `https://my-tunnel-name.trycloudflare.com`

#### 4A.3 Extract Quick Tunnel URL and update PROD_API_BASE

Use the provided helper script to automate URL extraction and frontend redeployment. Run it **on the Pi**:

```bash
cd /opt/kingshot
./scripts/sync_quick_tunnel_api_base.sh
```

The script will:
1. Read the Quick Tunnel URL from local systemd logs
2. Update the `PROD_API_BASE` GitHub variable with the URL
3. Trigger the `deploy-frontend.yml` workflow to redeploy the frontend

**Manual alternative:**

1. SSH to Pi and get the URL:
   ```bash
   sudo journalctl -u kingshot-quicktunnel -n 100 | grep trycloudflare
   ```

2. In GitHub, go to **Settings → Secrets and variables → Actions → Variables**

3. Update `PROD_API_BASE` to your Quick Tunnel URL (for example `https://my-tunnel-name.trycloudflare.com`)

4. In GitHub **Actions**, manually trigger **Deploy Frontend to GitHub Pages**

#### 4A.4 Verify End-to-End Functionality

1. Hard-refresh `https://merxbj.github.io/kingshot_hive/` in your browser
2. Verify in page source that `window.__API_BASE__` shows your Quick Tunnel URL (inspect → Console)
3. Confirm no mixed-content errors in the browser console
4. Test **Save to Server** with a layout
5. Test **Browse Server** to load the saved layout
6. Verify the share/load flow works end-to-end

**Testing the tunnel endpoint directly:**

```bash
TUNNEL_URL=$(sudo journalctl -u kingshot-quicktunnel -n 100 | grep trycloudflare | tail -1 | grep -oP 'https://[^\s]+' | head -1)
curl -I "$TUNNEL_URL/api/layouts/"
curl "$TUNNEL_URL/api/layouts/"
```

Expected: HTTP 200 and JSON body (for example `[]`).

---

## Operational Reminders

### Updating compose.prod.yml or other deployment configs

The CI/CD deployment workflow pulls the Docker image from GHCR and runs `docker compose up -d`, but does **not** pull git changes on the Pi.

If you update any of the following files, you must manually pull them on the Pi:
- `deploy/compose.prod.yml`
- `deploy/.env.prod`
- Any other config file referenced in the compose stack

**On Pi, to apply config changes:**

```bash
ssh kingshot@<pi-ip>
cd /opt/kingshot
git pull
docker compose -f deploy/compose.prod.yml up -d
```

This is by design: Docker images are the source of truth for application code and dependencies; configuration and deployment manifests are managed separately.

### Quick Tunnel URL changes

The Quick Tunnel URL changes each time the `kingshot-quicktunnel` service restarts (for example, after a reboot). When this happens:

1. Use the sync helper script (simplest), run on the Pi:
   ```bash
   cd /opt/kingshot
   ./scripts/sync_quick_tunnel_api_base.sh
   ```

2. Or manually:
   - Extract new URL from Pi: `sudo journalctl -u kingshot-quicktunnel | grep trycloudflare`
   - Update GitHub `PROD_API_BASE` variable
   - Trigger frontend deploy manually or via the script with `--skip-workflow` to just update the variable

---

## Phase 5: Troubleshooting Quick Reference

| Issue | Diagnosis | Fix |
|---|---|---|
| Pages site 404 | Workflow didn't run | Check Actions logs; ensure `main` exists; manually trigger deploy-frontend |
| Pages shows raw placeholders (for example `__PROD_API_BASE__`) | Pages source set to legacy branch deployment | In Settings → Pages set Source to GitHub Actions; verify `build_type` is `workflow` via `gh api repos/<owner>/<repo>/pages` |
| Backend API unreachable from Pages | CORS or network issue | Check `CORS_ORIGIN` in `deploy/.env.prod`; verify firewall/NAT |
| Mixed Content error in browser console | Frontend is HTTPS but `PROD_API_BASE` is HTTP | Verify Quick Tunnel service is running on Pi: `sudo systemctl status kingshot-quicktunnel`; check `PROD_API_BASE` is set to `https://...trycloudflare.com` |
| Quick Tunnel service won't start | cloudflared not installed or permissions issue | Verify cloudflared is installed: `which cloudflared`; check service logs: `sudo journalctl -u kingshot-quicktunnel` |
| Cannot extract Quick Tunnel URL from logs | Service just started or logs rotated | Wait 10 seconds for tunnel to establish; check: `sudo journalctl -u kingshot-quicktunnel -n 50 \| grep trycloudflare` |
| Sync script fails to connect to Pi | SSH or authentication issue | Test manually: `ssh -i ~/.ssh/kingshot-deploy kingshot@<pi-ip> echo ok`; verify secret `DEPLOY_SSH_KEY` is correct |
| Deploy workflow fails | SSH key or host unreachable | Test `ssh -i key kingshot@host` from GH runner context; add to known_hosts |
| Pi service won't start | Image pull failed | Check GHCR auth; verify image tag in deploy output; check Docker logs |
| Rate limiting error | Too many write requests | Expected if testing; will reset; check rate limiter in handlers.go |

---

## Next Steps

1. **Complete GitHub Setup** (Phase 1) ✅
2. **Prepare Raspberry Pi** (Phase 2) ✅
3. **Enable and Test Workflows** (Phase 3) ✅
4. **Set Up Cloudflare Quick Tunnel** (Phase 4A)
   - Install cloudflared
   - Create and enable systemd service
   - Extract URL and update `PROD_API_BASE`
   - Verify end-to-end functionality

For architectural questions or long-term planning, refer to [plan-deployment.md](plans/plan-deployment.md).
