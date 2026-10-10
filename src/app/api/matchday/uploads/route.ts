import { NextResponse } from "next/server";
import { hasMatchdaySession } from "lib/auth";
import { createUploadSession, maximumChunkSize } from "lib/resumable-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
    if (!await hasMatchdaySession())
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    try {
        const body = await request.json() as { filename?: unknown; size?: unknown };

        if (typeof body.filename !== "string" || typeof body.size !== "number")
            return NextResponse.json({ error: "A filename and file size are required" }, { status: 400 });

        const session = await createUploadSession(body.filename, body.size);

        return NextResponse.json({ ...session, chunkSize: maximumChunkSize }, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Could not start upload";

        return NextResponse.json({ error: message }, { status: 400 });
    }
}
