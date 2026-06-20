#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/switch-kibaco.sh local   # Use this checkout via pnpm link --global
  scripts/switch-kibaco.sh npm     # Use the published npm package
  scripts/switch-kibaco.sh status  # Show the currently resolved kibaco

Environment:
  KIBACO_NPM_VERSION  npm version/range to install when using "npm" (default: latest)
USAGE
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
npm_version="${KIBACO_NPM_VERSION:-latest}"

show_status() {
  echo "Resolved kibaco:"
  if command -v kibaco >/dev/null 2>&1; then
    command -v kibaco
    kibaco --version || true
  else
    echo "not found"
  fi

  echo
  echo "Global npm package:"
  npm list -g kibaco --depth=0 || true
}

case "${1:-}" in
  local)
    cd "$repo_root"
    pnpm install
    pnpm build
    pnpm link --global
    show_status
    ;;
  npm)
    cd "$repo_root"
    pnpm unlink --global kibaco >/dev/null 2>&1 || true
    npm install -g "kibaco@${npm_version}"
    show_status
    ;;
  status)
    show_status
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
