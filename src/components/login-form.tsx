"use client";

import {
    Alert,
    Button,
    Container,
    Paper,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useState } from "react";

type Props = { readonly onAuthenticated: () => void; };

/**
 * Renders the matchday manager login form.
 * @param root0 - The component props.
 * @param root0.onAuthenticated - Called after a successful login.
 * @returns The login form UI.
 */
export function LoginForm({ onAuthenticated }: Props): ReactNode {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    /**
     * Submits the login form.
     * @param event - The form submit event.
     */
    async function login(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        setError("");
        const headers = new Headers();

        headers.set("content-type", "application/json");
        const response = await fetch("/api/matchday/login", {
            body: JSON.stringify({ password, username }),
            headers,
            method: "POST",
        });

        if (!response.ok) {
            setError("That username or password was not accepted.");

            return;
        }

        onAuthenticated();
        setPassword("");
    }

    /**
     * Handles login form submission.
     * @param event - The form submit event.
     */
    function handleSubmit(event: FormEvent<HTMLFormElement>): void {
        void login(event);
    }

    /**
     * Handles username changes.
     * @param event - The input change event.
     */
    function handleUsernameChange(event: ChangeEvent<HTMLInputElement>): void {
        setUsername(event.target.value);
    }

    /**
     * Handles password changes.
     * @param event - The input change event.
     */
    function handlePasswordChange(event: ChangeEvent<HTMLInputElement>): void {
        setPassword(event.target.value);
    }

    return (
        <Container component="main" maxWidth="sm" sx={{ py: { md: 8, xs: 5 } }}>
            <Paper sx={{ p: { md: 4, xs: 3 } }} variant="outlined">
                {/* eslint-disable-next-line react/jsx-no-bind */}
                <Stack component="form" onSubmit={handleSubmit} spacing={2}>
                    <Typography
                        sx={{
                            fontSize: { md: "4.5rem", xs: "2.75rem" },
                            lineHeight: 0.94,
                        }}
                        variant="h1"
                    >
                        Matchday control
                    </Typography>
                    <Typography>
                        Sign in to manage the single video shown across the clubhouse TVs.
                    </Typography>
                    {/* eslint-disable react/jsx-no-bind */}
                    <TextField
                        autoComplete="username"
                        label="Username"
                        onChange={handleUsernameChange}
                        required
                        value={username}
                    />
                    <TextField
                        autoComplete="current-password"
                        label="Password"
                        onChange={handlePasswordChange}
                        required
                        type="password"
                        value={password}
                    />
                    {/* eslint-enable react/jsx-no-bind */}
                    <Button size="large" type="submit" variant="contained">Sign in</Button>
                    {error ? <Alert severity="error">{error}</Alert> : null}
                </Stack>
            </Paper>
        </Container>
    );
}
