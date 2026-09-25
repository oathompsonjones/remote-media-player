#!/bin/sh
# Builds and starts the local display server.
# This script must not require network access: the display can play its cached
# video while the VPS is unreachable.
set -e

cd "$(dirname "$0")"

npm run build

exec node dist/display.js
