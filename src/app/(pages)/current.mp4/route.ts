import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { videoStats } from "../../../lib/matchday";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams the current MP4 with optional byte-range support.
 * @param request - The incoming media request.
 * @returns The current video response.
 */
export async function GET(request: Request): Promise<NextResponse> {
    const file = await videoStats().catch(() => null);

    if (!file)
        return new NextResponse("No video is configured", { status: 404 });

    const fileSize = Number(file.size);
    const range = request.headers.get("range");
    let end = fileSize - 1;
    let start = 0;
    let status = 200;

    if (range === null) {
        status = 200;
    } else {
        end = Number((/-(\d*)$/).exec(range)?.[1] ?? fileSize - 1);
        start = Number((/bytes=(\d+)-/).exec(range)?.[1] ?? 0);
        status = 206;
    }

    if (start >= fileSize || end >= fileSize || start > end)
        return new NextResponse(null, { status: 416 });

    const storagePath = process.env.MATCHDAY_STORAGE_PATH ?? "/var/lib/rugby-display";
    const stream = createReadStream(`${storagePath}/current.mp4`, { end, start });
    const headers = new Headers();

    headers.set("accept-ranges", "bytes");
    headers.set("cache-control", "no-cache");
    headers.set("content-length", String(end - start + 1));
    headers.set("content-range", `bytes ${start}-${end}/${fileSize}`);
    headers.set("content-type", "video/mp4");

    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
        headers,
        status,
    });
}
