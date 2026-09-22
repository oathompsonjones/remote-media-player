import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const storageDirectory = process.env.MATCHDAY_STORAGE_PATH ?? "/var/lib/rugby-display";
const temporaryDirectory = path.join(storageDirectory, ".uploading");
const videoPath = path.join(storageDirectory, "current.mp4");
const metadataPath = path.join(storageDirectory, "metadata.json");

export const maximumVideoSize = 5 * 1024 * 1024 * 1024;
const sessionLifetimeMilliseconds = 30 * 24 * 60 * 60 * 1000;

export type VideoMetadata = {
    id: string;
    filename: string;
    size: number;
    mimeType: "video/mp4";
    uploadedAt: string;
    duration?: number;
    width?: number;
    height?: number;
    videoCodec?: string;
    audioCodec?: string;
    sha256: string;
};

/**
 * Reads the configured session secret.
 * @returns The configured secret.
 * @throws If the secret is missing or too short.
 */
function requiredSecret(): string {
    const secret = process.env.MATCHDAY_SESSION_SECRET;

    if (secret === undefined || secret.length < 32)
        throw new Error("MATCHDAY_SESSION_SECRET must be at least 32 characters");

    return secret;
}

/**
 * Creates a signed session token.
 * @returns The signed session token.
 */
export function createSessionToken(): string {
    const payload = `matchday:${Date.now()}`;
    const signature = createHmac("sha256", requiredSecret()).update(payload).digest("base64url");

    return `${payload}.${signature}`;
}

/**
 * Checks a signed session token and its expiry.
 * @param token - The session token to validate.
 * @returns Whether the token is valid.
 */
export function isValidSessionToken(token: string | undefined): boolean {
    if (token === undefined)
        return false;

    let decodedToken: string;

    try {
        decodedToken = decodeURIComponent(token);
    } catch {
        return false;
    }

    const separator = decodedToken.lastIndexOf(".");

    if (separator < 1)
        return false;

    const payload = decodedToken.slice(0, separator);
    const issuedAt = Number(payload.split(":")[1]);

    if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > sessionLifetimeMilliseconds || issuedAt > Date.now())
        return false;

    const supplied = Buffer.from(decodedToken.slice(separator + 1));
    const expected = createHmac("sha256", requiredSecret()).update(payload).digest("base64url");

    return supplied.length === expected.length && timingSafeEqual(supplied, Buffer.from(expected));
}

/**
 * Checks administrator credentials.
 * @param username - The submitted username.
 * @param password - The submitted password.
 * @returns Whether the credentials are valid.
 */
export function credentialsAreValid(username: string, password: string): boolean {
    return username === (process.env.MATCHDAY_ADMIN_USERNAME ?? "admin") &&
        password === (process.env.MATCHDAY_ADMIN_PASSWORD ?? "");
}

/**
 * Reads the current video metadata.
 * @returns The current metadata, or null when no metadata exists.
 */
export async function readVideoMetadata(): Promise<VideoMetadata | null> {
    try {
        return JSON.parse(await readFile(metadataPath, "utf8")) as VideoMetadata;
    } catch {
        return null;
    }
}

/**
 * Creates a stream for the current video.
 * @returns The current video stream.
 */
export function streamVideo(): ReturnType<typeof createReadStream> {
    return createReadStream(videoPath);
}

/**
 * Reads statistics for the current video.
 * @returns The current video statistics.
 */
export async function videoStats(): Promise<Awaited<ReturnType<typeof stat>>> {
    return stat(videoPath);
}

/**
 * Calculates a file's SHA-256 digest.
 * @param filePath - The file to hash.
 * @returns The hexadecimal digest.
 */
async function sha256File(filePath: string): Promise<string> {
    const hash = createHash("sha256");

    for await (const chunk of createReadStream(filePath) as AsyncIterable<Uint8Array>)
        hash.update(chunk);

    return hash.digest("hex");
}

type ProbeStream = Readonly<Record<string, number | string | undefined>>;

type Probe = { readonly format?: { readonly duration?: string; }; readonly streams?: ProbeStream[]; };

/**
 * Extracts video details with ffprobe.
 * @param filePath - The video to inspect.
 * @returns The discovered media details.
 */
async function inspectVideo(
    filePath: string,
): Promise<Pick<VideoMetadata, "audioCodec" | "duration" | "height" | "videoCodec" | "width">> {
    const { stdout } = await execFileAsync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name,width,height",
        "-of",
        "json",
        filePath,
    ]);
    const probe = JSON.parse(stdout) as Probe;
    const video = probe.streams?.find((stream) => stream.codec_type === "video");
    const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
    const duration = probe.format?.duration;
    const audioCodec = audio?.codec_name;
    const videoCodec = video?.codec_name;
    const height = video?.height;
    const width = video?.width;

    if (typeof videoCodec !== "string" || typeof width !== "number" || typeof height !== "number")
        throw new Error("The file does not contain a usable video stream");

    return {
        ...duration === undefined ? {} : { duration: Number(duration) },
        height,
        videoCodec,
        width,
        ...typeof audioCodec === "string" ? { audioCodec } : {},
    };
}

/**
 * Validates and atomically replaces the current video.
 * @param body - The incoming video stream.
 * @param filename - The original filename.
 * @param contentLength - The optional request content length.
 * @returns The metadata for the replaced video.
 */
export async function replaceVideo(
    body: ReadableStream<Uint8Array>,
    filename: string,
    contentLength?: number,
): Promise<VideoMetadata> {
    if (!filename.toLowerCase().endsWith(".mp4"))
        throw new Error("Only MP4 files are accepted");

    if (contentLength !== undefined && contentLength > maximumVideoSize)
        throw new Error("The video exceeds the 5 GB limit");

    await mkdir(temporaryDirectory, { recursive: true });
    const temporaryPath = path.join(temporaryDirectory, `${crypto.randomUUID()}.tmp`);
    let written = 0;

    try {
        const output = createWriteStream(temporaryPath, { flags: "wx" });

        for await (const chunk of body as AsyncIterable<Uint8Array>) {
            written += chunk.byteLength;

            if (written > maximumVideoSize)
                throw new Error("The video exceeds the 5 GB limit");

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
        const details = await inspectVideo(temporaryPath);
        const metadata: VideoMetadata = {
            ...details,
            filename: path.basename(filename).replace(/[^a-zA-Z0-9._ -]/gu, "_") || "matchday.mp4",
            id: crypto.randomUUID(),
            mimeType: "video/mp4",
            sha256: await sha256File(temporaryPath),
            size: written,
            uploadedAt: new Date().toISOString(),
        };

        await rename(temporaryPath, videoPath);
        await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

        return metadata;
    } finally {
        await rm(temporaryPath, { force: true });
    }
}
