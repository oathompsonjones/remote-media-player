import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
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

export type MatchdayProgress = {
    readonly state: "active" | "error" | "idle" | "optimising";
    readonly progress: number;
    readonly error?: string;
    readonly metadata?: VideoMetadata;
};

type ProgressListener = (progress: MatchdayProgress) => void;

let currentProgress: MatchdayProgress = {
    progress: 0,
    state: "idle",
};

const progressListeners = new Set<ProgressListener>();

/**
 * Gets the current matchday processing progress.
 * @returns The current progress.
 */
export function getMatchdayProgress(): MatchdayProgress {
    return currentProgress;
}

/**
 * Subscribes to matchday processing progress.
 * @param listener - The progress listener to subscribe to.
 * @returns A function that removes the listener.
 */
export function subscribeMatchdayProgress(listener: ProgressListener): () => void {
    progressListeners.add(listener);

    return (): void => {
        progressListeners.delete(listener);
    };
}

/**
 * Publishes matchday processing progress.
 * @param progress - The new progress.
 */
function publishMatchdayProgress(progress: MatchdayProgress): void {
    currentProgress = progress;

    for (const listener of progressListeners)
        listener(progress);
}

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

type Probe = {
    readonly format?: {
        readonly duration?: string;
    };
    readonly streams?: ProbeStream[];
};

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
 * Re-encodes a video for smooth playback on the kiosk display.
 * Matches the ffmpeg settings verified to fix stutter on the Raspberry Pi player.
 * @param inputPath - The uploaded source file.
 * @param outputPath - The destination for the re-encoded file.
 * @param duration - The input video duration in seconds.
 */
async function transcodeForDisplay(inputPath: string, outputPath: string, duration?: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const process = spawn("ffmpeg", [
            "-y",
            "-i",
            inputPath,
            "-vf",
            "fps=25",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "23",
            "-profile:v",
            "high",
            "-level",
            "4.0",
            "-pix_fmt",
            "yuv420p",
            "-an",
            "-movflags",
            "+faststart",
            "-f",
            "mp4",
            "-progress",
            "pipe:1",
            "-nostats",
            outputPath,
        ], { stdio: ["ignore", "pipe", "pipe"] });

        const progressReader = createInterface({ input: process.stdout });

        let stderr = "";
        let settled = false;

        process.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();

            if (stderr.length > 16_384)
                stderr = stderr.slice(-16_384);
        });

        progressReader.on("line", (line: string): void => {
            const separator = line.indexOf("=");

            if (separator === -1)
                return;

            const key = line.slice(0, separator);
            const value = line.slice(separator + 1);

            if (key !== "out_time_us" || duration === undefined || duration <= 0)
                return;

            const outputTime = Number(value) / 1_000_000;

            if (!Number.isFinite(outputTime))
                return;

            const progress = Math.min(95, Math.max(0, Math.round(outputTime / duration * 95)));

            publishMatchdayProgress({ progress, state: "optimising" });
        });

        process.once("error", (error: Error): void => {
            if (settled)
                return;

            settled = true;
            progressReader.close();
            reject(error);
        });

        process.once("close", (code: number | null): void => {
            if (settled)
                return;

            settled = true;
            progressReader.close();

            if (code === 0) {
                publishMatchdayProgress({ progress: 95, state: "optimising" });
                resolve();
            } else {
                reject(new Error(stderr.trim() || `ffmpeg exited with code ${code ?? "unknown"}`));
            }
        });
    });
}

/**
 * Streams an upload body to disk, enforcing the maximum size.
 * @param body - The incoming video stream.
 * @param destinationPath - The file to write to.
 */
async function writeUploadToDisk(body: ReadableStream<Uint8Array>, destinationPath: string): Promise<void> {
    const output = createWriteStream(destinationPath, { flags: "wx" });
    let written = 0;

    for await (const chunk of body as AsyncIterable<Uint8Array> & ReadableStream<Uint8Array>) {
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
}

/**
 * Validates and atomically replaces the current video.
 * @param body - The incoming video stream.
 * @param filename - The original filename.
 * @param contentLength - The optional request content length.
 * @returns The metadata for the replaced video.
 */
// eslint-disable-next-line max-statements
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
    const uploadedPath = path.join(temporaryDirectory, `${crypto.randomUUID()}.upload.tmp`);
    const transcodedPath = path.join(temporaryDirectory, `${crypto.randomUUID()}.mp4.tmp`);

    try {
        await writeUploadToDisk(body, uploadedPath);

        publishMatchdayProgress({ progress: 0, state: "optimising" });

        const inputDetails = await inspectVideo(uploadedPath);

        try {
            await transcodeForDisplay(uploadedPath, transcodedPath, inputDetails.duration);
        } catch (error) {
            console.error("Matchday transcode failed", error);
            throw new Error("The video could not be optimised for the display");
        }

        publishMatchdayProgress({ progress: 96, state: "optimising" });

        const details = await inspectVideo(transcodedPath);

        publishMatchdayProgress({ progress: 97, state: "optimising" });

        const { size } = await stat(transcodedPath);

        publishMatchdayProgress({ progress: 98, state: "optimising" });

        const metadata: VideoMetadata = {
            ...details,
            filename: path.basename(filename).replace(/[^a-zA-Z0-9._ -]/gu, "_") || "matchday.mp4",
            id: crypto.randomUUID(),
            mimeType: "video/mp4",
            sha256: await sha256File(transcodedPath),
            size,
            uploadedAt: new Date().toISOString(),
        };

        publishMatchdayProgress({ progress: 99, state: "optimising" });

        await rename(transcodedPath, videoPath);
        await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

        publishMatchdayProgress({ metadata, progress: 100, state: "active" });

        return metadata;
    } catch (error) {
        publishMatchdayProgress({
            error: error instanceof Error
                ? error.message
                : "Upload failed; the existing video remains active",
            progress: 0,
            state: "error",
        });

        throw error;
    } finally {
        await rm(uploadedPath, { force: true });
        await rm(transcodedPath, { force: true });
    }
}
