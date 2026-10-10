import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { maximumVideoSize } from "lib/matchday";

const storageDirectory = process.env.MATCHDAY_STORAGE_PATH ?? "/var/lib/rugby-display";
const uploadDirectory = path.join(storageDirectory, ".uploading", "resumable");
export const maximumChunkSize = 8 * 1024 * 1024;
const sessionLifetimeMilliseconds = 48 * 60 * 60 * 1000;

export type ResumableUploadSession = {
    readonly id: string;
    readonly filename: string;
    readonly size: number;
    readonly createdAt: string;
};

export type ResumableUploadStatus = ResumableUploadSession & {
    readonly offset: number;
};

function sessionPath(id: string): string {
    if (!/^[0-9a-f-]{36}$/iu.test(id))
        throw new Error("Invalid upload session");

    return path.join(uploadDirectory, `${id}.json`);
}

function partPath(id: string): string {
    sessionPath(id);

    return path.join(uploadDirectory, `${id}.part`);
}

async function readSession(id: string): Promise<ResumableUploadSession> {
    const session = JSON.parse(await readFile(sessionPath(id), "utf8")) as ResumableUploadSession;

    if (Date.now() - new Date(session.createdAt).getTime() > sessionLifetimeMilliseconds) {
        await removeUploadSession(id);
        throw new Error("Upload session expired. Start the upload again.");
    }

    return session;
}

/**
 * Creates a persistent upload session and its temporary file.
 * @param filename - The original video filename.
 * @param size - The complete file size in bytes.
 * @returns The new session and initial offset.
 */
export async function createUploadSession(filename: string, size: number): Promise<ResumableUploadStatus> {
    if (!filename.toLowerCase().endsWith(".mp4"))
        throw new Error("Only MP4 files are accepted");

    if (!Number.isSafeInteger(size) || size <= 0 || size > maximumVideoSize)
        throw new Error("The video must be between 1 byte and 5 GB");

    await mkdir(uploadDirectory, { recursive: true });

    const session: ResumableUploadSession = {
        createdAt: new Date().toISOString(),
        filename: path.basename(filename).replace(/[^a-zA-Z0-9._ -]/gu, "_") || "matchday.mp4",
        id: randomUUID(),
        size,
    };

    const handle = await open(partPath(session.id), "wx");

    await handle.close();
    await writeFile(sessionPath(session.id), JSON.stringify(session), { flag: "wx" });

    return { ...session, offset: 0 };
}

/**
 * Returns the server-confirmed upload offset.
 * @param id - The upload session ID.
 * @returns The session and current byte offset.
 */
export async function getUploadSession(id: string): Promise<ResumableUploadStatus> {
    const session = await readSession(id);
    const { size } = await stat(partPath(id));

    return { ...session, offset: size };
}

/**
 * Writes one chunk at the expected byte offset.
 * @param id - The upload session ID.
 * @param offset - The expected starting byte offset.
 * @param chunk - The chunk bytes.
 * @returns The new confirmed offset.
 */
export async function appendUploadChunk(id: string, offset: number, chunk: Uint8Array): Promise<number> {
    const session = await readSession(id);
    const filePath = partPath(id);
    const file = await open(filePath, "r+");

    try {
        const { size } = await file.stat();

        if (offset !== size)
            throw new Error(`Upload offset mismatch; server has received ${size} bytes`);

        if (chunk.byteLength === 0 || chunk.byteLength > maximumChunkSize)
            throw new Error("Chunk must be between 1 byte and 8 MB");

        if (size + chunk.byteLength > session.size)
            throw new Error("Chunk exceeds the declared file size");

        let written = 0;

        while (written < chunk.byteLength) {
            const result = await file.write(chunk, written, chunk.byteLength - written, size + written);

            if (result.bytesWritten === 0)
                throw new Error("Could not write upload chunk");

            written += result.bytesWritten;
        }

        await file.sync();

        return size + written;
    } finally {
        await file.close();
    }
}

/**
 * Removes an upload session and its temporary file.
 * @param id - The upload session ID.
 */
export async function removeUploadSession(id: string): Promise<void> {
    await Promise.all([
        rm(sessionPath(id), { force: true }),
        rm(partPath(id), { force: true }),
    ]);
}

/**
 * Gets the local path of a completed upload.
 * @param id - The upload session ID.
 * @returns The validated session and path to its temporary video.
 */
export async function getCompletedUpload(id: string): Promise<{ session: ResumableUploadSession; filePath: string }> {
    const session = await readSession(id);
    const filePath = partPath(id);
    const { size } = await stat(filePath);

    if (size !== session.size)
        throw new Error(`Upload is incomplete: ${size} of ${session.size} bytes received`);

    return { session, filePath };
}
