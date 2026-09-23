#!/usr/bin/env bash
set -euo pipefail

# Angular CLI 22 (used by sailbrowser-web and home-site) requires Node >= 22.22.3.
# The base image ships an older Node, and the exec-daemon prepends /exec-daemon
# (whose bundled node is too old) ahead of nvm on PATH — so `nvm use` alone does
# not win in agent shells. Install the latest Node 22 via nvm, then expose it via
# symlinks in the earliest writable PATH entry (/usr/local/cargo/bin, which the
# runtime places ahead of /exec-daemon) so every shell resolves the right Node.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 22 >/dev/null
nvm alias default 22 >/dev/null
nvm use default >/dev/null

nvm_bin="$(dirname "$(nvm which default)")"
priority_dir="/usr/local/cargo/bin"
if [ -d "$priority_dir" ] && [ -w "$priority_dir" ]; then
  for bin in node npm npx; do
    ln -sf "${nvm_bin}/${bin}" "${priority_dir}/${bin}"
  done
fi
export PATH="${nvm_bin}:${PATH}"
echo "Using Node $(node -v) / npm $(npm -v) from ${nvm_bin}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# Node/TypeScript workspaces. Flutter mobile-recorder is intentionally excluded
# (separate mobile toolchain, not part of the web/functions dev loop).
for dir in sailbrowser-web home-site firebase firebase/functions; do
  echo "==> npm ci in ${dir}"
  ( cd "$dir" && npm ci )
done

echo "Install complete."
