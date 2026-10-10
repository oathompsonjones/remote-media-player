import { appendUploadChunk, getUploadSession, maximumChunkSize } from "lib/resumable-upload";
import { NextResponse } from "next/server";
import { hasMatchdaySession } from "lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { readonly params: Promise<{ readonly id: string; }>; };

/**
 * Handles the HTTP HEAD request for a specific upload session, returning its current status.
 * @param _request - The incoming HTTP HEAD request.
 * @param context - The context object containing route parameters.
 * @returns A response with the current upload session status or an error message.
 */
export async function HEAD(_request: Request, context: Context): Promise<Response> {
    if (!await hasMatchdaySession())
        return new Response(null, { status: 401 });

    try {
        const { id } = await context.params;
        const session = await getUploadSession(id);

        return new Response(null, {
            /* eslint-disable @typescript-eslint/naming-convention */
            headers: {
                "Cache-Control": "no-store",
                "Upload-Length": String(session.size),
                "Upload-Offset": String(session.offset),
            },
            /* eslint-enable */
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Upload session not found" },
            { status: 404 },
        );
    }
}

/**
 * Handles the HTTP PATCH request for a specific upload session, appending a new chunk of the video.
 * @param request - The incoming HTTP PATCH request containing the video chunk.
 * @param context - The context object containing route parameters.
 * @returns A JSON response containing the new upload offset or an error message.
 */
export async function PATCH(request: Request, context: Context): Promise<NextResponse> {
    if (!await hasMatchdaySession())
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    try {
        const { id } = await context.params;
        const offsetHeader = request.headers.get("upload-offset");
        const offset = offsetHeader === null ? NaN : Number(offsetHeader);
        const contentLength = request.headers.get("content-length");
        const chunk = new Uint8Array(await request.arrayBuffer());

        if (!Number.isSafeInteger(offset) || offset < 0)
            return NextResponse.json({ error: "A valid Upload-Offset header is required" }, { status: 400 });

        if (contentLength !== null && Number(contentLength) !== chunk.byteLength)
            return NextResponse.json({ error: "Chunk length does not match Content-Length" }, { status: 400 });

        if (chunk.byteLength > maximumChunkSize)
            return NextResponse.json({ error: "Chunk exceeds the 8 MB limit" }, { status: 413 });

        const newOffset = await appendUploadChunk(id, offset, chunk);

        return NextResponse.json({ offset: newOffset }, {
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "Cache-Control": "no-store", "Upload-Offset": String(newOffset),
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Could not save upload chunk";
        const status = message.includes("not found") || message.includes("expired") ? 404 : 409;

        return NextResponse.json({ error: message }, { status });
    }
}
