import { NextResponse } from "next/server";
import { hasMatchdaySession } from "../../../../lib/auth";
import { replaceVideo } from "../../../../lib/matchday";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Validates and replaces the current matchday video.
 * @param request - The upload request.
 * @returns The upload result response.
 */
export async function POST(request: Request): Promise<NextResponse> {
    if (!await hasMatchdaySession())
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    if (!request.body)
        return NextResponse.json({ error: "No video supplied" }, { status: 400 });

    try {
        const contentLength = request.headers.get("content-length");
        const filename = request.headers.get("x-matchday-filename") ?? "matchday.mp4";
        const metadata = await replaceVideo(
            request.body,
            filename,
            contentLength === null ? undefined : Number(contentLength),
        );

        return NextResponse.json(metadata);
    } catch (error) {
        console.error("Matchday upload failed", error);

        const message = error instanceof Error
            ? error.message
            : "Upload failed; the existing video remains active";

        return NextResponse.json({ error: message }, { status: 400 });
    }
}
