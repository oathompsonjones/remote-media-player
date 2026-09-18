import { cookies } from "next/headers";
import { isValidSessionToken } from "./matchday";

/**
 * Checks whether the request has a valid matchday session cookie.
 * @returns Whether the current request is authenticated.
 */
export async function hasMatchdaySession(): Promise<boolean> {
    return isValidSessionToken((await cookies()).get("matchday_session")?.value);
}
