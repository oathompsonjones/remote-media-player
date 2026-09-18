import type { ReactNode } from "react";
import { hasMatchdaySession } from "lib/auth";
// eslint-disable-next-line sort-imports
import { MatchdayManager } from "components/matchday-manager";
import { readVideoMetadata } from "lib/matchday";

export const dynamic = "force-dynamic";

/**
 * Renders the matchday manager at the root route.
 * @returns The matchday manager page.
 */
export default async function Home(): Promise<ReactNode> {
    return <MatchdayManager authenticated={await hasMatchdaySession()} initialMetadata={await readVideoMetadata()} />;
}
