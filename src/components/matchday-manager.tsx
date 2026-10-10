"use client";

import {
    Alert,
    Box,
    Button,
    Container,
    LinearProgress,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableRow,
    Typography,
} from "@mui/material";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { Download, OpenInNew } from "@mui/icons-material";
import type { MatchdayProgress, VideoMetadata } from "lib/matchday";
import { useEffect, useRef, useState } from "react";
import { LoginForm } from "components/login-form";

type Props = { readonly authenticated: boolean; readonly initialMetadata: VideoMetadata | null; };

type UploadError = { readonly error?: string; };

const enum States {
    Idle = "Idle",
    ReadyToUpload = "Ready to upload",
    Uploading = "Uploading",
    OptimisingForDisplay = "Optimising for display",
    UploadFailed = "Upload failed",
}

/**
 * Checks if the given state represents an in-progress upload.
 * @param state - The current state.
 * @returns True if the state is uploading or optimising for display, false otherwise.
 */
function isInProgress(state: States): boolean {
    return state === States.Uploading || state === States.OptimisingForDisplay;
}

/**
 * Returns a user-friendly message indicating whether it is safe to leave or refresh the page based
 * on the current state.
 * @param state - The current state.
 * @returns The appropriate refresh warning message.
 */
function refreshWarning(state: States): ReactNode {
    if (state === States.Uploading) {
        return (
            <Typography color="textSecondary">
                If interrupted, reselect the same file to resume the upload.
            </Typography>
        );
    }

    if (state === States.OptimisingForDisplay) {
        return (
            <Typography color="textSecondary">
                It is safe to leave or refresh the page
            </Typography>
        );
    }

    return null;
}

/**
 * Formats a byte count for display.
 * @param bytes - The byte count.
 * @returns The formatted byte count.
 */
function formatBytes(bytes: number): string {
    const units = ["bytes", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;

    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }

    return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

/**
 * Formats a duration in seconds as minutes and seconds.
 * @param duration - The duration in seconds.
 * @returns The formatted duration.
 */
function formatDuration(duration?: number): string {
    if (duration === undefined)
        return "Unknown";

    const seconds = Math.round(duration);

    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Formats an upload timestamp in the user's local timezone.
 * @param uploadedAt - The ISO timestamp.
 * @returns The formatted timestamp.
 */
function formatUploadedAt(uploadedAt: string): string {
    return new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        timeZoneName: "short",
        weekday: "long",
        year: "numeric",
    }).format(new Date(uploadedAt));
}

/**
 * Renders the login and video management workflow.
 * @param root0 - The component props.
 * @param root0.authenticated - The initial authentication state.
 * @param root0.initialMetadata - The current video metadata.
 * @returns The matchday manager UI.
 */
// eslint-disable-next-line max-lines-per-function
export function MatchdayManager({ authenticated, initialMetadata }: Props): ReactNode {
    const [loggedIn, setLoggedIn] = useState(authenticated);
    const [metadata, setMetadata] = useState(initialMetadata);
    const [file, setFile] = useState<File | null>(null);
    const [progress, setProgress] = useState(0);
    const [state, setState] = useState(States.Idle);
    const [error, setError] = useState("");
    const [mounted, setMounted] = useState(false);
    const uploadButtonRef = useRef<HTMLButtonElement>(null);

    /**
     * Handles a selected video file.
     * @param event - The file input change event.
     */
    function chooseFile(event: ChangeEvent<HTMLInputElement>): void {
        const selected = event.target.files?.[0] ?? null;

        setFile(selected);
        setError("");
        setState(selected ? States.ReadyToUpload : States.Idle);
        setProgress(0);

        if (selected)
            requestAnimationFrame(() => uploadButtonRef.current?.focus());
    }

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!loggedIn)
            return (): void => undefined;

        const progressSource = new EventSource("/api/matchday/progress");

        progressSource.onmessage = (message: MessageEvent<string>): void => {
            try {
                const update = JSON.parse(message.data) as MatchdayProgress;

                if (update.state === "uploading") {
                    setState(States.Uploading);
                    setProgress(update.progress);
                } else if (update.state === "optimising") {
                    setState(States.OptimisingForDisplay);
                    setProgress(update.progress);
                } else if (update.state === "active") {
                    if (update.metadata)
                        setMetadata(update.metadata);

                    setState(States.Idle);
                    setFile(null);
                    setProgress(0);
                } else if (update.state === "error") {
                    setState(States.UploadFailed);
                    setError(update.error ?? "Upload failed; the existing video remains active.");
                }
            } catch {
                // Ignore malformed progress events.
            }
        };

        progressSource.onerror = (): void => {
            // EventSource automatically reconnects.
        };

        return (): void => progressSource.close();
    }, [loggedIn]);

    /**
     * Uploads and activates the selected video.
     * @param event - The form submit event.
     */
    // eslint-disable-next-line max-statements
    async function upload(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();

        if (!file) {
            setError("Choose an MP4 first.");

            return;
        }

        setError("");
        setState(States.Uploading);

        const storageKey = `matchday-upload:${file.name}:${file.size}:${file.lastModified}`;
        const readError = async (response: Response): Promise<string> => {
            try {
                return ((await response.json()) as UploadError).error ?? `Request failed (${response.status})`;
            } catch {
                return `Request failed (${response.status})`;
            }
        };

        try {
            let sessionId = localStorage.getItem(storageKey);
            let offset = 0;

            if (sessionId !== null) {
                const resume = await fetch(`/api/matchday/uploads/${sessionId}`, { method: "HEAD" });

                if (resume.ok && Number(resume.headers.get("upload-length")) === file.size) {
                    offset = Number(resume.headers.get("upload-offset"));
                } else {
                    localStorage.removeItem(storageKey);
                    sessionId = null;
                }
            }

            if (sessionId === null) {
                const create = await fetch("/api/matchday/uploads", {
                    body: JSON.stringify({ filename: file.name, size: file.size }),
                    headers: {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        "content-type": "application/json",
                    },
                    method: "POST",
                });

                if (!create.ok)
                    throw new Error(await readError(create));

                const session = (await create.json()) as { id: string; offset: number; chunkSize: number; };

                sessionId = session.id;
                ({ offset } = session);
                localStorage.setItem(storageKey, sessionId);
            }

            const chunkSize = 8 * 1024 * 1024;

            while (offset < file.size) {
                const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
                let acknowledged = false;

                for (let attempt = 0; !acknowledged; attempt += 1) {
                    try {
                        // eslint-disable-next-line no-await-in-loop
                        const response = await fetch(`/api/matchday/uploads/${sessionId}`, {
                            body: chunk,
                            headers: {
                                // eslint-disable-next-line @typescript-eslint/naming-convention
                                "content-type": "application/offset+octet-stream", "upload-offset": String(offset),
                            },
                            method: "PATCH",
                        });

                        if (response.ok) {
                            offset = Number(response.headers.get("upload-offset"));
                            acknowledged = true;
                        } else {
                            // eslint-disable-next-line no-await-in-loop
                            const message = await readError(response);

                            // eslint-disable-next-line max-depth
                            if (response.status === 409) {
                                // eslint-disable-next-line no-await-in-loop
                                const status = await fetch(`/api/matchday/uploads/${sessionId}`, { method: "HEAD" });

                                // eslint-disable-next-line max-depth
                                if (status.ok) {
                                    const confirmedOffset = Number(status.headers.get("upload-offset"));

                                    // eslint-disable-next-line max-depth
                                    if (confirmedOffset !== offset) {
                                        offset = confirmedOffset;
                                        acknowledged = true;
                                        continue;
                                    }
                                }
                            }

                            throw new Error(message);
                        }
                    } catch (e) {
                        if (!(e instanceof TypeError))
                            throw e;

                        // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
                        await new Promise<void>((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 10000)));

                        // eslint-disable-next-line no-await-in-loop
                        const status = await fetch(`/api/matchday/uploads/${sessionId}`, { method: "HEAD" });

                        if (status.ok) {
                            const confirmedOffset = Number(status.headers.get("upload-offset"));

                            // eslint-disable-next-line max-depth
                            if (confirmedOffset > offset) {
                                offset = confirmedOffset;
                                acknowledged = true;
                            }
                        }

                        if (e instanceof Error && e.message.startsWith("Upload session expired"))
                            throw e;
                    }
                }

                setProgress(Math.min(99, Math.round(offset / file.size * 100)));
            }

            setState(States.OptimisingForDisplay);
            setProgress(0);

            const complete = await fetch(`/api/matchday/uploads/${sessionId}/complete`, { method: "POST" });

            if (!complete.ok)
                throw new Error(await readError(complete));

            setMetadata(await complete.json() as VideoMetadata);
            localStorage.removeItem(storageKey);
            setState(States.Idle);
            setFile(null);
            setProgress(0);
        } catch (uploadError) {
            setState(States.UploadFailed);
            setError(uploadError instanceof Error
                ? uploadError.message
                : "Upload failed; the existing video remains active.");
        }
    }

    /**
     * Marks the manager as authenticated after a successful login.
     */
    function handleAuthenticated(): void {
        setLoggedIn(true);
    }

    if (!loggedIn)
        // eslint-disable-next-line react/jsx-no-bind
        return <LoginForm onAuthenticated={handleAuthenticated} />;

    return (
        <Container component="main" maxWidth="lg" sx={{ py: { md: 8, xs: 5 } }}>
            <Stack spacing={1.5} sx={{ mb: 5 }}>
                <Box>
                    <Typography sx={{ fontWeight: 700 }} variant="overline">
                        Clubhouse display
                    </Typography>
                    <Typography
                        sx={{
                            fontSize: { md: "4.75rem", xs: "2.75rem" },
                            lineHeight: 0.94,
                            mt: 1,
                        }}
                        variant="h1"
                    >
                        Display Manager
                    </Typography>
                    <Typography sx={{ fontSize: "1.2rem", mt: 1 }}>
                        Manage the content shown on the clubhouse displays.
                    </Typography>
                </Box>
            </Stack>
            <Box
                sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: { md: "minmax(0, 1.25fr) minmax(0, .75fr)", xs: "minmax(0, 1fr)" },
                    minWidth: 0,
                }}
            >
                <Paper sx={{ minWidth: 0, p: { md: 3.5, xs: 2.5 } }} variant="outlined">
                    <Typography sx={{ fontWeight: 700 }} variant="overline">
                        Current video
                    </Typography>
                    {metadata
                        ? (
                            <Stack spacing={3} sx={{ mt: 2 }}>
                                <Typography
                                    sx={{ fontSize: "2rem", overflowWrap: "anywhere" }}
                                    variant="h2"
                                >
                                    {metadata.filename}
                                </Typography>
                                <TableContainer>
                                    <Table size="small" sx={{ borderTop: 1 }}>
                                        <TableBody>
                                            {Object.entries({
                                                Codec: metadata.videoCodec ?? "Unknown",
                                                Duration: formatDuration(metadata.duration),
                                                Resolution: `${metadata.width} × ${metadata.height}`,
                                                Size: formatBytes(metadata.size),
                                                Uploaded: mounted
                                                    ? formatUploadedAt(metadata.uploadedAt)
                                                    : "Loading...",
                                            }).map(([label, value]): ReactNode => (
                                                <TableRow key={label}>
                                                    <TableCell
                                                        sx={{
                                                            borderColor: "primary.main",
                                                            fontWeight: 700,
                                                            letterSpacing: ".08em",
                                                            textTransform: "uppercase",
                                                        }}
                                                        variant="head"
                                                    >
                                                        {label}
                                                    </TableCell>
                                                    <TableCell
                                                        align="right"
                                                        sx={{
                                                            borderColor: "primary.main",
                                                            color: "text.secondary",
                                                            fontWeight: 500,
                                                        }}
                                                    >
                                                        {value}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                                <Button
                                    href="/current.mp4"
                                    rel="noreferrer"
                                    sx={{ alignSelf: "flex-start", px: 0 }}
                                    target="_blank"
                                    variant="text"
                                >
                                    Preview current video <OpenInNew />
                                </Button>
                            </Stack>
                        )
                        : (
                            <Typography sx={{ mt: 2 }}>
                                No video has been uploaded yet.
                            </Typography>
                        )}
                </Paper>
                <Paper sx={{ minWidth: 0, p: { md: 3.5, xs: 2.5 } }} variant="outlined">
                    <Typography sx={{ fontWeight: 700 }} variant="overline">
                        Replace video
                    </Typography>
                    <Typography sx={{ fontSize: "2rem", mb: 3, mt: 2 }} variant="h2">
                        Upload a new video
                    </Typography>
                    <Typography color="textSecondary" sx={{ mb: 3 }}>
                        Upload a new video to replace the current one.
                        The video will be validated and re-encoded for smooth playback before going live.
                        The current video will remain active until the new video is ready.
                    </Typography>
                    {/* eslint-disable react/jsx-no-bind */}
                    <Stack
                        component="form"
                        // eslint-disable-next-line @typescript-eslint/no-misused-promises
                        onSubmit={upload}
                        spacing={2}
                        sx={{ maxWidth: "100%", minWidth: 0, overflow: "hidden", width: "100%" }}
                    >
                        <Button
                            component="label"
                            disabled={isInProgress(state)}
                            onClick={(event): void => {
                                if (event.detail === 0 && file) {
                                    event.preventDefault();
                                    event.currentTarget.form?.requestSubmit(uploadButtonRef.current ?? undefined);
                                }
                            }}
                            sx={{
                                justifyContent: "flex-start",
                                maxWidth: "100%",
                                minHeight: 58,
                                minWidth: 0,
                                overflow: "hidden",
                                textAlign: "left",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                            tabIndex={-1}
                            variant="outlined"
                        >
                            {file ? file.name : "Choose an MP4 file"}
                            <input accept="video/mp4,.mp4" hidden onChange={chooseFile} type="file" />
                        </Button>
                        <Button
                            disabled={!file || isInProgress(state)}
                            loading={isInProgress(state)}
                            type="submit"
                            variant="contained"
                        >
                            Upload and activate
                        </Button>
                        <Button
                            disabled={!metadata || isInProgress(state)}
                            download={metadata?.filename ?? "current.mp4"}
                            href="/current.mp4"
                            startIcon={<Download />}
                            variant="outlined"
                        >
                            Download optimised video
                        </Button>
                        {isInProgress(state) && (
                            <LinearProgress
                                sx={{ maxWidth: "100%", overflow: "hidden", width: "100%" }}
                                value={progress}
                                variant="determinate"
                            />
                        )}
                        <Typography variant="body2">
                            {state}
                            {isInProgress(state) && ` · ${progress}%`}
                            {refreshWarning(state)}
                        </Typography>
                        {error ? <Alert severity="error">{error}</Alert> : null}
                    </Stack>
                </Paper>
            </Box>
        </Container>
    );
}
