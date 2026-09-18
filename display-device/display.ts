import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";

type RemoteVideo = Readonly<{
    downloadUrl: string;
    filename: string;
    id: string;
    sha256: string;
    size: number;
}>;
const root = process.env.RUGBY_DISPLAY_DIR ?? "/opt/rugby-display";
const serverUrl = (process.env.RUGBY_DISPLAY_URL ?? "https://example.com").replace(/\/$/u, "");
const port = Number(process.env.RUGBY_DISPLAY_PORT ?? 8787);
const videoPath = path.join(root, "current.mp4");
const metadataPath = path.join(root, "metadata.json");

/**
 * Reads metadata for the locally cached video.
 * @returns The cached metadata, or null when it is unavailable.
 */
async function localMetadata(): Promise<RemoteVideo | null> {
    try {
        return JSON.parse(await readFile(metadataPath, "utf8")) as RemoteVideo;
    } catch {
        return null;
    }
}
/**
 * Calculates a file's SHA-256 digest.
 * @param filePath - The file to hash.
 * @returns The hexadecimal digest.
 */
async function hashFile(filePath: string): Promise<string> {
    const hash = createHash("sha256");

    for await (const chunk of createReadStream(filePath) as AsyncIterable<Uint8Array>)
        hash.update(chunk);

    return hash.digest("hex");
}

/**
 * Synchronizes the cached video with the remote display service.
 * @returns A promise that resolves after synchronization.
 */
async function sync(): Promise<void> {
    try {
        const response = await fetch(`${serverUrl}/api/display/current`, { signal: AbortSignal.timeout(15000) });

        if (!response.ok)
            throw new Error(`metadata request returned ${response.status}`);

        const remote = await response.json() as RemoteVideo;
        const local = await localMetadata();

        if (local?.id === remote.id && local.sha256 === remote.sha256)
            return;

        const temporaryPath = path.join(root, `.downloading-${Date.now()}.tmp`);
        const download = await fetch(
            new URL(remote.downloadUrl, serverUrl),
            { signal: AbortSignal.timeout(30 * 60 * 1000) },
        );

        if (!download.ok || !download.body)
            throw new Error(`video request returned ${download.status}`);

        const output = createWriteStream(temporaryPath, { flags: "wx" });

        for await (const chunk of download.body as AsyncIterable<Uint8Array>) {
            if (!output.write(chunk)) {
                await new Promise<void>((resolve) => {
                    output.once("drain", () => resolve());
                });
            }
        }
        await new Promise<void>((resolve, reject) => {
            output.once("error", reject);
            output.end(() => resolve());
        });
        const file = await stat(temporaryPath);
        const fileSize = Number(file.size);

        if (fileSize !== remote.size || await hashFile(temporaryPath) !== remote.sha256)
            throw new Error("download checksum or size did not match");

        await rename(temporaryPath, videoPath);
        await writeFile(metadataPath, `${JSON.stringify(remote)}\n`, "utf8");
        console.log(`Synced ${remote.filename} (${remote.size} bytes)`);
    } catch (error) {
        console.error("Sync failed; keeping the local video:", error instanceof Error ? error.message : error);
    }
}

/**
 * Serves cached metadata, playback HTML, and video content.
 * @param request - The incoming HTTP request.
 * @param response - The outgoing HTTP response.
 * @returns A promise that resolves after the request is handled.
 */
async function serve(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.url === "/local-metadata") {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(await localMetadata()));

        return;
    }

    if (request.url === "/" || request.url === "/index.html") {
        response.setHeader("content-type", "text/html");
        response.end(await readFile(path.join(import.meta.dirname, "playback.html")));

        return;
    }

    if (request.url === "/current.mp4") {
        const file = await stat(videoPath).catch(() => null);

        if (!file) {
            response.writeHead(404);
            response.end();

            return;
        }

        const fileSize = Number(file.size);

        response.setHeader("cache-control", "no-cache");
        response.setHeader("content-length", fileSize);
        response.setHeader("content-type", "video/mp4");
        response.writeHead(200);
        createReadStream(videoPath).pipe(response);

        return;
    }

    response.writeHead(404);
    response.end();
}

await mkdir(root, { recursive: true });
createServer((request, response) => {
    void serve(request, response);
}).listen(port, "127.0.0.1", () => console.log(`Playback server listening on ${port}`));
await sync();
setInterval(() => {
    sync().catch(() => undefined);
}, Number(process.env.RUGBY_DISPLAY_SYNC_SECONDS ?? 300) * 1000);
