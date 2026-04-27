#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Sync Quick Tunnel URL to GitHub Pages config.

This script will:
1) SSH to your Pi and read the latest https://*.trycloudflare.com URL
   from systemd journal logs for the tunnel service.
2) Update the GitHub Actions variable (default: PROD_API_BASE).
3) Trigger the frontend deployment workflow.

Usage:
  scripts/sync_quick_tunnel_api_base.sh --pi-host <host-or-ip> [options]

Required:
  --pi-host <host>            Pi hostname or IP address

Options:
  --pi-user <user>            SSH user (default: kingshot)
  --service <name>            systemd service name (default: kingshot-quicktunnel)
  --repo <owner/name>         GitHub repo (default: inferred from git origin)
  --variable <name>           GitHub Actions variable to update (default: PROD_API_BASE)
  --workflow <file-or-name>   Workflow to trigger (default: deploy-frontend.yml)
  --skip-workflow             Do not trigger workflow after updating variable
  --dry-run                   Print actions but do not call gh API/workflow
  -h, --help                  Show this help

Environment variables:
  SSH_OPTS                    Extra ssh options (e.g. "-i ~/.ssh/key -p 25022")

Examples:
  scripts/sync_quick_tunnel_api_base.sh --pi-host 192.168.88.48
  scripts/sync_quick_tunnel_api_base.sh --pi-host mypi.local --repo merxbj/kingshot_hive
EOF
}

infer_repo() {
  local origin
  origin="$(git config --get remote.origin.url 2>/dev/null || true)"
  if [[ -z "$origin" ]]; then
    return 1
  fi

  if [[ "$origin" =~ github.com[:/]([^/]+)/([^/]+)(\.git)?$ ]]; then
    local owner repo
    owner="${BASH_REMATCH[1]}"
    repo="${BASH_REMATCH[2]}"
    repo="${repo%.git}"
    printf '%s/%s\n' "$owner" "$repo"
    return 0
  fi

  return 1
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: required command not found: $cmd" >&2
    exit 1
  fi
}

PI_HOST=""
PI_USER="kingshot"
SERVICE_NAME="kingshot-quicktunnel"
REPO=""
VARIABLE_NAME="PROD_API_BASE"
WORKFLOW="deploy-frontend.yml"
SKIP_WORKFLOW="false"
DRY_RUN="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pi-host)
      PI_HOST="${2:-}"
      shift 2
      ;;
    --pi-user)
      PI_USER="${2:-}"
      shift 2
      ;;
    --service)
      SERVICE_NAME="${2:-}"
      shift 2
      ;;
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --variable)
      VARIABLE_NAME="${2:-}"
      shift 2
      ;;
    --workflow)
      WORKFLOW="${2:-}"
      shift 2
      ;;
    --skip-workflow)
      SKIP_WORKFLOW="true"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$PI_HOST" ]]; then
  echo "Error: --pi-host is required." >&2
  usage
  exit 1
fi

if [[ -z "$REPO" ]]; then
  REPO="$(infer_repo || true)"
fi

if [[ -z "$REPO" ]]; then
  echo "Error: could not infer repository from git origin. Use --repo <owner/name>." >&2
  exit 1
fi

require_cmd ssh
require_cmd gh

echo "Reading Quick Tunnel URL from $PI_USER@$PI_HOST (service: $SERVICE_NAME)..."

TUNNEL_URL="$({
  ssh ${SSH_OPTS:-} "$PI_USER@$PI_HOST" "SERVICE_NAME='$SERVICE_NAME' bash -s" <<'EOF'
set -euo pipefail
journalctl -u "$SERVICE_NAME" -n 300 --no-pager \
  | grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' \
  | tail -1
EOF
} || true)"

if [[ -z "$TUNNEL_URL" ]]; then
  echo "Error: could not find a Quick Tunnel URL in service logs." >&2
  echo "Check that the service is running and producing a trycloudflare URL." >&2
  exit 1
fi

echo "Found tunnel URL: $TUNNEL_URL"
echo "Target repo: $REPO"
echo "Variable to update: $VARIABLE_NAME"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[dry-run] Would run: gh variable set $VARIABLE_NAME --repo $REPO --body $TUNNEL_URL"
else
  gh variable set "$VARIABLE_NAME" --repo "$REPO" --body "$TUNNEL_URL"
  echo "Updated $VARIABLE_NAME in $REPO"
fi

if [[ "$SKIP_WORKFLOW" == "true" ]]; then
  echo "Skipping workflow trigger (--skip-workflow set)."
  exit 0
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[dry-run] Would run: gh workflow run $WORKFLOW --repo $REPO"
else
  gh workflow run "$WORKFLOW" --repo "$REPO"
  echo "Triggered workflow: $WORKFLOW"
fi

echo "Done. Wait for deploy to finish, then hard-refresh the GitHub Pages app."
