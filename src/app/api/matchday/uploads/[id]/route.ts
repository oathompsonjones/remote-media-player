import { NextResponse } from "next/server";
import { hasMatchdaySession } from "lib/auth";
import { appendUploadChunk, getUploadSession, maximumChunkSize } from "lib/resumable-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { readonly params: Promise<{ readonly id: string }>; };

export async function HEAD(_request: Request, context: Context): Promise<Response> {
    if (!await hasMatchdaySession())
        return new Response(null, { status: 401 });

    try {
        const { id } = await context.params;
        const session = await getUploadSession(id);

        return new Response(null, {
            headers: {
                "Upload-Length": String(session.size),
                "Upload-Offset": String(session.offset),
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Upload session not found" },
            { status: 404 },
        );
    }
}

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
            headers: { "Upload-Offset": String(newOffset), "Cache-Control": "no-store" },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Could not save upload chunk";
        const status = message.includes("not found") || message.includes("expired") ? 404 : 409;

        return NextResponse.json({ error: message }, { status });
    }
}
