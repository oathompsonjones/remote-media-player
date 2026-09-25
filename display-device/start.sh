#!/bin/sh
# Builds and starts the local display server.
# Network access is optional: the display can play its cached video while the
# VPS is unreachable.
set -e

cd "$(dirname "$0")"

if git ls-remote origin HEAD >/dev/null 2>&1; then
    echo "Network available; checking for display software updates"

    if git pull --ff-only && npm install; then
        echo "Display software updated"
    else
        echo "Display software update failed; using existing version"
    fi
else
    echo "Network unavailable; using existing display software"
fi

npm run build

exec node dist/display.js
