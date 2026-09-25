# Rugby Club Matchday Display

This is a single-video matchday display manager. The VPS stores one validated current MP4 and its metadata; a display device periodically downloads a verified local copy and plays that copy in Chromium. Playback does not depend on the VPS remaining reachable.

## Existing application

The project uses Next.js 16.3.5 App Router, React 19, TypeScript 7, and plain global CSS. It has no database, authentication package, or existing reverse-proxy configuration in this repository. The matchday manager therefore uses a filesystem outside the application, signed HTTP-only session cookies, and Node.js route handlers.

## VPS setup

Install `ffmpeg` (which provides `ffprobe`) and create the persistent directory:

```sh
sudo apt install ffmpeg
sudo install -d -o <app-user> -g <app-user> -m 750 /var/lib/rugby-display/.uploading
```

Set the variables in the deployment environment using [.env.example](.env.example). `MATCHDAY_SESSION_SECRET` must be at least 32 characters. Do not commit the real `.env` file. The application process needs read/write access to `/var/lib/rugby-display`.

The management page is `/matchday`. The read-only display-device metadata endpoint is `/api/display/current`, and the local video URL is `/matchday/current.mp4`. The media route supports HTTP ranges, but the display device downloads once and plays from its own disk.

Configure the existing VPS reverse proxy to pass `/matchday`, `/api`, and the Next.js application to the existing Next process. If the proxy supports upload limits, set the site limit above 5 GB (for nginx, `client_max_body_size 5G`). Do not configure the proxy to serve the storage directory directly unless you prefer that over the built-in range-capable media route; never put the storage directory inside the application or public tree.

## Display device setup

On the display device's operating system, install Node.js 22+, Chromium, `curl`, Git, and systemd prerequisites. Clone this repository to `/opt/rugby-display`:

```sh
sudo git clone https://github.com/oathompsonjones/remote-media-player.git /opt/rugby-display
sudo chown -R display:display /opt/rugby-display
cd /opt/rugby-display/display-device
npm install
```

The initial `npm install` requires network access, but it is not required for subsequent offline boots.

Install the display service and labwc autostart configuration:

```sh
sudo install -o root -g root -m 644 systemd/rugby-display.service /etc/systemd/system/rugby-display.service
sudo install -o display -g display -m 644 labwc/autostart /home/display/.config/labwc/autostart

sudo systemctl disable --now chromium-kiosk.service 2>/dev/null || true
sudo rm -f /etc/systemd/system/chromium-kiosk.service

sudo systemctl daemon-reload
sudo systemctl enable --now rugby-display.service
```

Configure the display device to log into its graphical session automatically as `display`, with HDMI connected to the distribution system. The labwc autostart waits for the local playback server at `http://127.0.0.1:8787/`, then opens it in Chromium kiosk mode.

The display server starts independently of the network. On startup, `start.sh` checks whether the GitHub remote is reachable. If it is, it attempts a fast-forward-only `git pull` and `npm install`; if the network is unavailable, the update is skipped. If an update fails, the existing checkout is used and startup continues. The display then builds and starts the local server regardless.

The local server serves the cached video locally, then attempts to synchronise with the VPS. If the VPS or network is unavailable, synchronisation fails harmlessly and the existing local video remains available. This means the display can boot, start Chromium, and play its cached video with no network connection at all.

The first boot needs one successful sync before there is anything to play. The display device does not need an administrator login or upload credentials.

### Updating the display device

The display automatically checks for software updates whenever its service starts and the GitHub remote is reachable. To apply an update manually, or immediately after changing the configuration:

```sh
cd /opt/rugby-display
git pull --ff-only
cd display-device
npm install
sudo systemctl restart rugby-display.service
```

## Operational notes

Upload progress is reported in the management page. A new upload is streamed to `.uploading`, inspected by `ffprobe`, then re-encoded with `ffmpeg` (25fps, H.264 high profile, no audio, faststart) for smooth playback on the display, hashed, and only then moved to `current.mp4`; a failed upload or re-encode is removed while the previous active video remains available. There is intentionally no archive, history, playlist, schedule, or database.

The current implementation logs upload failures and display-device sync failures to the process/systemd logs. View them with `journalctl -u rugby-display.service` on the display device and the process manager logs on the VPS.
To set your project up with just one command, add the following script to your `.bashrc` file:
```sh
function nextinit() {
    # Clones the repo
    git clone --depth=1 https://github.com/oathompsonjones/next-init.git .
    # Remove the git history
    rm -rf ./.git
    # Reinitialises git
    git init
    # Installs the dependencies
    pnpm i
    pnpm update --latest
    # Creates files which git ignores
    touch .env
    mkdir .vscode
    touch .vscode/settings.json
    echo -e "{\n\t\"vitest.commandLine\": \"pnpx vitest watch\",\n\t\"vitest.enable\": true\n}" > .vscode/settings.json
    mkdir public
    mkdir src/hooks
    mkdir src/contexts
    mkdir src/assets
    mkdir src/assets/images
    mkdir src/app/api
    # Opens the index file in VSCode
    code ./src/app/\(pages\)/\(home\)/page.tsx
}
```
To use the function, simply run the command `nextinit` in an empty directory using a fresh bash terminal.
