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

The display device can be any Linux machine capable of running Chromium and Node.js, including Raspberry Pi boards. The exact Node.js version depends on the machine's CPU architecture and operating system: use the newest Node.js version supported by the platform that is compatible with this application. For example, current Debian/Raspbian packages provide Node.js 18 for the original ARMv6 Raspberry Pi Zero W, while newer Raspberry Pi models can use newer Node.js releases.

The commands below target Debian/Raspbian-based systems. On another Linux distribution, install the equivalent packages using its package manager.

### 1. Install prerequisites

Install Node.js, npm, Chromium, curl, Git, and systemd:

```sh
sudo apt update
sudo apt install nodejs npm chromium curl git systemd
```

Check the versions and architecture:

```sh
node --version
npm --version
uname -m
```

The display application does not require Node.js 22 specifically. On platforms that cannot run Node.js 22 or newer, an older supported Node.js release can be used. The display device's `start.sh` only requires a working Node.js runtime and npm installation.

Chromium must be available as the `chromium` executable. If your distribution installs it under a different name, either install/configure the equivalent Chromium package or adjust the labwc autostart command accordingly.

### 2. Create the display service user

The systemd service runs as a dedicated `display` user. If your operating system does not already provide one, create it:

```sh
sudo useradd --system --create-home --home-dir /home/display --shell /bin/bash display
```

The display user needs access to the graphical/video devices. On systems that provide these groups, add it to `video` and `render`:

```sh
getent group video >/dev/null && sudo usermod -aG video display || true
getent group render >/dev/null && sudo usermod -aG render display || true
```

If you use a different user instead, replace `display` consistently in the systemd service, file ownership, and graphical-session configuration.

### 3. Clone and install the display application

Clone the repository and make the display user the owner:

```sh
sudo git clone --depth=1 https://github.com/oathompsonjones/remote-media-player.git /opt/rugby-display
sudo chown -R display:display /opt/rugby-display
```

Install the display application's dependencies:

```sh
cd /opt/rugby-display/display-device
sudo -u display npm install
```

The initial `npm install` requires network access. It is not required for subsequent offline boots unless the display software is updated.

### 4. Configure the graphical session

The supplied autostart file is written for labwc. If the machine uses labwc, create its configuration directory and install the autostart file:

```sh
sudo install -d -o display -g display -m 755 /home/display/.config/labwc
sudo install -o display -g display -m 644 labwc/autostart /home/display/.config/labwc/autostart
```

Configure the machine's graphical login manager to automatically log into the graphical session as `display`, with the display connected to the required HDMI output.

If you use a different Wayland compositor or desktop environment, configure its equivalent graphical-session autostart mechanism to wait for `http://127.0.0.1:8787/` and then launch Chromium in kiosk mode against that URL. The application itself does not require labwc.

### 5. Install and enable the systemd service

Install the service:

```sh
sudo install -o root -g root -m 644 systemd/rugby-display.service /etc/systemd/system/rugby-display.service

sudo systemctl daemon-reload
sudo systemctl enable --now rugby-display.service
```


The labwc autostart waits for the local playback server at `http://127.0.0.1:8787/`, then opens it in Chromium kiosk mode.

### 6. First synchronisation

The display server starts independently of the network. On startup, `start.sh` checks whether the GitHub remote is reachable. If it is, it attempts a fast-forward-only `git pull` and `npm install`; if the network is unavailable, the update is skipped. If an update fails, the existing checkout is used and startup continues. The display then builds and starts the local server regardless.

The local server serves the cached video locally, then attempts to synchronise with the VPS. If the VPS or network is unavailable, synchronisation fails harmlessly and the existing local video remains available. This means the display can boot, start Chromium, and play its cached video with no network connection at all.

The first boot needs one successful sync before there is anything to play. Connect the machine to the network for the initial synchronisation, then verify that a video is cached before deploying it somewhere without network access.


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
