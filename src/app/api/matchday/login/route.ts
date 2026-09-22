import { createSessionToken, credentialsAreValid } from "../../../../lib/matchday";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Creates a session for valid matchday credentials.
 * @param request - The login request.
 * @returns The login response.
 */
export async function POST(request: Request): Promise<NextResponse> {
    const body = await request.json() as { username?: string; password?: string; };

    if (!credentialsAreValid(body.username ?? "", body.password ?? ""))
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

    const response = NextResponse.json({ ok: true });

    response.headers.set("cache-control", "no-store");
    const forwardedProtocol = request.headers.get("x-forwarded-proto");
    const protocol = forwardedProtocol?.split(",")[0]?.trim() ?? new URL(request.url).protocol;
    const secure = protocol === "https" || protocol === "https:";

    response.cookies.set("matchday_session", createSessionToken(), {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
        sameSite: "strict",
        secure,
    });

    return response;
}
