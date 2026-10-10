import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { hasMatchdaySession } from "lib/auth";
import { replaceVideo } from "lib/matchday";
import { getCompletedUpload, removeUploadSession } from "lib/resumable-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { readonly params: Promise<{ readonly id: string }>; };

export async function POST(_request: Request, context: Context): Promise<NextResponse> {
    if (!await hasMatchdaySession())
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    let id = "";

    try {
        id = (await context.params).id;
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
