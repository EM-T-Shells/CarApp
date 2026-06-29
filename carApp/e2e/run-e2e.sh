#!/usr/bin/env bash
#
# run-e2e.sh — build the app onto a booted iOS Simulator and run the
# Maestro E2E suite that covers Blueprint/User_Stories.
#
#   Usage:
#     ./e2e/run-e2e.sh                 # full suite
#     ./e2e/run-e2e.sh bookings        # only flows tagged `bookings`
#     ./e2e/run-e2e.sh --flow e2e/auth-flow.yaml
#
# Maestro automates iOS via the SIMULATOR ONLY — a physical iPad/iPhone
# is not supported by the Maestro iOS driver. Boot a simulator first
# (Xcode → Simulator, or `xcrun simctl boot "iPhone 15"`).
#
# Prereqs:
#   • Maestro CLI:  curl -fsSL https://get.maestro.mobile.dev | bash
#   • A booted iOS Simulator with the dev build installed
#     (`npx expo run:ios` once, then reuse the build)
set -euo pipefail

APP_ID="com.emre.carapp"
E2E_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$E2E_DIR")"

if ! command -v maestro >/dev/null 2>&1; then
  echo "✖ maestro not found. Install: curl -fsSL https://get.maestro.mobile.dev | bash" >&2
  exit 1
fi

# Confirm a simulator is booted (Maestro can't target a physical iPad).
if ! xcrun simctl list devices booted | grep -q "Booted"; then
  echo "✖ No booted iOS Simulator. Boot one (Xcode → Simulator) and retry." >&2
  echo "  Maestro does not support physical iOS devices." >&2
  exit 1
fi

# Ensure the app is installed on the booted simulator.
if ! xcrun simctl get_app_container booted "$APP_ID" >/dev/null 2>&1; then
  echo "→ App not installed on simulator; building with expo run:ios…"
  ( cd "$APP_DIR" && npx expo run:ios )
fi

# Seed deterministic test data (auth users + bookings + job + thread).
# Requires SUPABASE_SERVICE_ROLE_KEY in carApp/.env.local. Skips with a
# warning if the key is absent so the suite can still run against a
# manually-seeded project. See e2e/SEEDING.md.
if [ "${SKIP_SEED:-0}" != "1" ]; then
  if ( cd "$APP_DIR" && npm run --silent seed:e2e ); then
    echo "→ seed complete"
  else
    echo "⚠ seed step failed/skipped — ensure test data exists (e2e/SEEDING.md)" >&2
  fi
fi

case "${1:-}" in
  "")            maestro test "$E2E_DIR" ;;
  --flow)        maestro test "$2" ;;
  *)             maestro test "$E2E_DIR" --include-tags "$1" ;;
esac
