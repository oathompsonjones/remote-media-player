#!/bin/sh
# Pulls the latest version of the repo before (re)building and starting the display server.
set -e

cd "$(dirname "$0")"

git pull --ff-only
npm install
npm run build

exec node dist/display.js
