import { getMatchdayProgress, subscribeMatchdayProgress } from "../../../../lib/matchday";
import { hasMatchdaySession } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams matchday upload progress to the authenticated client.
 * @returns A server-sent event stream.
 */
export async function GET(): Promise<Response> {
    if (!await hasMatchdaySession())
        return new Response("Authentication required", { status: 401 });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            const send = (progress: ReturnType<typeof getMatchdayProgress>): void => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(progress)}\n\n`));
            };

            send(getMatchdayProgress());

            const unsubscribe = subscribeMatchdayProgress(send);

            return (): void => {
                unsubscribe();
            };
        },
    });

    return new Response(stream, {
        headers: {
            /* eslint-disable @typescript-eslint/naming-convention */
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "Content-Type": "text/event-stream",
            "X-Accel-Buffering": "no",
            /* eslint-enable @typescript-eslint/naming-convention */
        },
    });
}
