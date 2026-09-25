import { MatchdayManager } from "components/matchday-manager";
import type { ReactNode } from "react";
import { hasMatchdaySession } from "lib/auth";
import { readVideoMetadata } from "lib/matchday";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Renders the matchday manager at the root route.
 * @returns The matchday manager page.
 */
export default async function Home(): Promise<ReactNode> {
    if (!await hasMatchdaySession())
        redirect("/login");

    return <MatchdayManager authenticated initialMetadata={await readVideoMetadata()} />;
}
