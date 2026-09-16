#!/usr/bin/env bash
set -euo pipefail

mkdir -p artifacts
REPORT="artifacts/ec2-strategybar-probe.txt"
: > "$REPORT"

{
  echo "EC2 StrategyBar source probe"
  echo "HOST=$(hostname)"
  echo "USER=$(whoami)"
  echo "HOME=$HOME"
  echo "DATE=$(date -Is)"
  echo
  echo "== wrangler.jsonc candidates =="
} >> "$REPORT"

mapfile -t WRANGLERS < <(find /home/ubuntu -maxdepth 6 -type f \( -name 'wrangler.jsonc' -o -name 'wrangler.toml' \) 2>/dev/null | sort -u)

if [ ${#WRANGLERS[@]} -eq 0 ]; then
  echo "NONE" >> "$REPORT"
else
  for WR in "${WRANGLERS[@]}"; do
    DIR=$(dirname "$WR")
    {
      echo "PATH=$DIR"
      [ -f "$DIR/package.json" ] && echo "PACKAGE_JSON=yes" || echo "PACKAGE_JSON=no"
      [ -f "$DIR/cloudflare/market.js" ] && echo "MARKET_JS=yes" || echo "MARKET_JS=no"
      [ -f "$DIR/cloudflare/index.js" ] && echo "WORKER_INDEX=yes" || echo "WORKER_INDEX=no"
      [ -f "$DIR/src/content/dashboard/DashboardContent.jsx" ] && echo "DASHBOARD_SOURCE=yes" || echo "DASHBOARD_SOURCE=no"
      if [ -f "$DIR/cloudflare/market.js" ]; then
        grep -q 'QLD' "$DIR/cloudflare/market.js" && echo "MARKET_HAS_QLD=yes" || echo "MARKET_HAS_QLD=no"
        grep -q 'TDAQ' "$DIR/cloudflare/market.js" && echo "MARKET_HAS_TDAQ=yes" || echo "MARKET_HAS_TDAQ=no"
      fi
      if [ -f "$DIR/src/content/dashboard/DashboardContent.jsx" ]; then
        grep -q 'QLD' "$DIR/src/content/dashboard/DashboardContent.jsx" && echo "DASHBOARD_HAS_QLD=yes" || echo "DASHBOARD_HAS_QLD=no"
      fi
      if [ -d "$DIR/.git" ]; then
        echo "GIT_REPO=yes"
        git -C "$DIR" branch --show-current 2>/dev/null | sed 's/^/GIT_BRANCH=/' || true
        git -C "$DIR" status --short 2>/dev/null | head -30 | sed 's/^/GIT_STATUS=/' || true
      else
        echo "GIT_REPO=no"
      fi
      echo "---"
    } >> "$REPORT"
  done
fi

{
  echo
  echo "== likely StrategyBar directories =="
} >> "$REPORT"
find /home/ubuntu -maxdepth 5 -type f -name 'DashboardContent.jsx' 2>/dev/null | while read -r FILE; do
  if grep -q 'strategybar:holdings:v1' "$FILE" 2>/dev/null; then
    dirname "$(dirname "$(dirname "$FILE")")" | sed 's/^/DASHBOARD_ROOT=/' >> "$REPORT"
  fi
done

{
  echo
  echo "== Cloudflare auth indicators (names only, no secret values) =="
  env | cut -d= -f1 | grep -E '^(CLOUDFLARE|CF_)' | sort | sed 's/^/ENV_NAME=/' || true
  for P in "$HOME/.wrangler" "$HOME/.config/.wrangler" "$HOME/.config/wrangler"; do
    [ -e "$P" ] && echo "AUTH_PATH_EXISTS=$P"
  done
} >> "$REPORT"

cat "$REPORT"
