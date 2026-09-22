"use client";

import { useRouter } from "next/navigation";
// eslint-disable-next-line sort-imports
import type { ReactNode } from "react";
// eslint-disable-next-line sort-imports
import { LoginForm } from "components/login-form";

/**
 * Renders the matchday manager login page.
 * @returns The login page UI.
 */
export default function LoginPage(): ReactNode {
    const router = useRouter();

    /**
     * Redirects to the manager after successful authentication.
     */
    function handleAuthenticated(): void {
        router.replace("/");
    }

    // eslint-disable-next-line react/jsx-no-bind
    return <LoginForm onAuthenticated={handleAuthenticated} />;
}
