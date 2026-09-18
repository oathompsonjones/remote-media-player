import { NextResponse } from "next/server";
import { readVideoMetadata } from "../../../../lib/matchday";

export const dynamic = "force-dynamic";

/**
 * Returns metadata for the video currently used by the display.
 * @returns The current video metadata response.
 */
export async function GET(): Promise<NextResponse> {
    const metadata = await readVideoMetadata();

    if (!metadata)
        return NextResponse.json({ error: "No video is configured" }, { status: 404 });

    const headers = new Headers();

    headers.set("cache-control", "no-store");

    return NextResponse.json({ ...metadata, downloadUrl: "/current.mp4" }, { headers });
}
