import { getCompletedUpload, removeUploadSession } from "lib/resumable-upload";
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { hasMatchdaySession } from "lib/auth";
import { replaceVideo } from "lib/matchday";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { readonly params: Promise<{ readonly id: string; }>; };

/**
 * Completes the upload process for a given video file.
 * @param _request - The incoming HTTP request.
 * @param context - The request context containing route parameters.
 * @returns A JSON response indicating the result of the upload completion.
 */
export async function POST(_request: Request, context: Context): Promise<NextResponse> {
    if (!await hasMatchdaySession())
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    let id = "";

    try {
        ({ id } = await context.params);
        const { session, filePath } = await getCompletedUpload(id);
        const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
        const metadata = await replaceVideo(body, session.filename, session.size);

        await removeUploadSession(id);

        return NextResponse.json(metadata);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Could not complete upload";

        if (id && (message.includes("expired") || message.includes("not found")))
            await removeUploadSession(id).catch(() => undefined);

        return NextResponse.json({ error: message }, { status: 400 });
    }
}
