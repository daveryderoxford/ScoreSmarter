#!/usr/bin/env bash
set -euo pipefail

# Angular CLI 22 (used by sailbrowser-web and home-site) requires Node >= 22.22.3.
# The base image's default Node is older, so select the latest Node 22 via nvm.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 22 >/dev/null
nvm alias default 22 >/dev/null
nvm use default >/dev/null
echo "Using Node $(node -v) / npm $(npm -v)"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# Node/TypeScript workspaces. Flutter mobile-recorder is intentionally excluded
# (separate mobile toolchain, not part of the web/functions dev loop).
for dir in sailbrowser-web home-site firebase firebase/functions; do
  echo "==> npm ci in ${dir}"
  ( cd "$dir" && npm ci )
done

echo "Install complete."
