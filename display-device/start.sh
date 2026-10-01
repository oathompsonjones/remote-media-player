#!/bin/sh
# Builds and starts the local display server.
# Network access is optional: the display can play its cached video while the
# VPS is unreachable.
set -e

cd "$(dirname "$0")"

update_display_software() {
    remote_commit="$(timeout 10 git ls-remote origin HEAD 2>/dev/null | awk '{print $1}')"

    if [ -z "$remote_commit" ]; then
        return 1
    fi

    local_commit="$(git rev-parse HEAD)"

    if [ "$remote_commit" = "$local_commit" ]; then
        return 0
    fi

    echo "Display software update available; updating from $local_commit to $remote_commit"

    if ! git pull --ff-only; then
        echo "Display software update failed; keeping existing version"
        return 1
    fi

    if ! npm install || ! npm run build; then
        echo "Display software update build failed; keeping existing running version"
        return 1
    fi

    return 0
}

echo "Checking for display software updates"

if update_display_software; then
    echo "Display software is up to date"
else
    echo "Display software update unavailable; using existing display software"
fi

npm run build

node dist/display.js &
server_pid=$!

trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM

while kill -0 "$server_pid" 2>/dev/null; do
    sleep 60

    if ! kill -0 "$server_pid" 2>/dev/null; then
        break
    fi

    if update_display_software; then
        echo "Display software updated; restarting display server"

        kill "$server_pid"
        wait "$server_pid" 2>/dev/null || true

        node dist/display.js &
        server_pid=$!
    fi
done

wait "$server_pid"
