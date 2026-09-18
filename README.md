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

On the display device's operating system, install Node.js 22+, Chromium, and systemd prerequisites. Copy `display-device/` to `/opt/rugby-display`, run `npm install` and `npm run build` there, then create a `display` user with access to that directory. Edit `display-device/rugby-display.service` and replace `RUGBY_DISPLAY_URL` with the HTTPS origin of this application. Install both units:

```sh
sudo cp display-device/rugby-display.service display-device/chromium-kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rugby-display.service chromium-kiosk.service
```

Configure the display device to log into its graphical session automatically as `display`, with HDMI connected to the distribution system. Chromium opens `http://127.0.0.1:8787/` in kiosk mode. `rugby-display.service` retries metadata and downloads every five minutes, verifies size and SHA-256, and restarts after crashes. A failed network request leaves the current local file untouched.

The first boot needs one successful sync before there is anything to play. The display device does not need an administrator login or upload credentials.

## Operational notes

Upload progress is reported in the management page. A new upload is streamed to `.uploading`, inspected by `ffprobe`, hashed, and only then moved to `current.mp4`; a failed upload is removed while the previous active video remains available. There is intentionally no archive, history, playlist, schedule, or database.

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
