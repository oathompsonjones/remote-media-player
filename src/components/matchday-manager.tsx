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
import type { MatchdayProgress, VideoMetadata } from "lib/matchday";
import { LoginForm } from "components/login-form";
import { OpenInNew } from "@mui/icons-material";
import { useEffect, useState } from "react";

type Props = { readonly authenticated: boolean; readonly initialMetadata: VideoMetadata | null; };

type UploadError = { readonly error?: string; };

const enum States {
    Ready = "Ready",
    ReadyToUpload = "Ready to upload",
    Uploading = "Uploading",
    OptimisingForDisplay = "Optimising for display",
    Active = "Active",
    UploadFailed = "Upload failed",
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
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
    }).format(new Date(uploadedAt));
}

/**
 * Extracts an upload error message from a response.
 * @param responseText - The response body.
 * @returns The error message.
 */
function parseUploadError(responseText: string): string {
    const response = JSON.parse(responseText) as UploadError;

    return response.error ?? "Upload failed; the existing video remains active.";
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
    const [state, setState] = useState(States.Ready);
    const [error, setError] = useState("");

    /**
     * Handles a selected video file.
     * @param event - The file input change event.
     */
    function chooseFile(event: ChangeEvent<HTMLInputElement>): void {
        const selected = event.target.files?.[0] ?? null;

        setFile(selected);
        setError("");
        setState(selected ? States.ReadyToUpload : States.Ready);
        setProgress(0);
    }

    useEffect(() => {
        if (!loggedIn)
            return undefined;

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

                    setState(States.Active);
                    setFile(null);
                    setProgress(100);
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

        return (): void => {
            progressSource.close();
        };
    }, [loggedIn]);

    /**
     * Uploads and activates the selected video.
     * @param event - The form submit event.
     */
    function upload(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();

        if (!file) {
            setError("Choose an MP4 first.");

            return;
        }

        setError("");
        setState(States.Uploading);
        setProgress(0);

        const request = new XMLHttpRequest();

        request.upload.onprogress = (progressEvent): void => {
            if (progressEvent.lengthComputable)
                setProgress(Math.round(progressEvent.loaded / progressEvent.total * 100));
        };

        request.upload.onload = (): void => {
            setState(States.OptimisingForDisplay);
            setProgress(0);
        };

        request.onload = (): void => {
            if (request.status >= 200 && request.status < 300) {
                setMetadata(JSON.parse(request.responseText) as VideoMetadata);
                setState(States.Active);
                setFile(null);
                setProgress(100);
            } else {
                setState(States.UploadFailed);
                setError(parseUploadError(request.responseText));
            }
        };

        request.onerror = (): void => {
            setState(States.UploadFailed);
            setError("The connection failed; the existing video remains active.");
        };

        request.open("POST", "/api/matchday/upload");
        request.setRequestHeader("content-type", "video/mp4");
        request.setRequestHeader("x-matchday-filename", file.name);
        request.send(file);
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
                        Video Uploader
                    </Typography>
                    <Typography sx={{ fontSize: "1.2rem", mt: 1 }}>
                        Only one video can be uploaded at a time.
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
                        ? <Stack spacing={3} sx={{ mt: 2 }}>
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
                                            Uploaded: formatUploadedAt(metadata.uploadedAt),
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
                            {/* eslint-disable-next-line react/jsx-closing-tag-location */}
                        </Stack>
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
                        Prepare the next display
                    </Typography>
                    <Typography color="textSecondary" sx={{ mb: 3 }}>
                        Uploading a new video will replace the current matchday video after validation.
                        It will be re-encoded for smooth playback on the display before it goes live, so
                        activation may take a few minutes after the upload finishes. The existing video
                        stays active if anything fails.
                    </Typography>
                    {/* eslint-disable react/jsx-no-bind */}
                    <Stack
                        component="form"
                        onSubmit={upload}
                        spacing={2}
                        sx={{ maxWidth: "100%", minWidth: 0, overflow: "hidden", width: "100%" }}
                    >
                        <Button
                            component="label"
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
                            variant="outlined"
                        >
                            {file ? file.name : "Choose an MP4 file"}
                            <input accept="video/mp4,.mp4" hidden onChange={chooseFile} type="file" />
                        </Button>
                        <Button
                            disabled={!file || state === States.Uploading || state === States.OptimisingForDisplay}
                            loading={state === States.Uploading || state === States.OptimisingForDisplay}
                            type="submit"
                            variant="contained"
                        >
                            Upload and activate
                        </Button>
                        {(state === States.Uploading || state === States.OptimisingForDisplay) && (
                            <LinearProgress
                                sx={{ maxWidth: "100%", overflow: "hidden", width: "100%" }}
                                value={progress}
                                variant="determinate"
                            />
                        )}
                        <Typography variant="body2">
                            {state === States.Uploading || state === States.OptimisingForDisplay
                                ? `${state} · ${progress}%`
                                : state}
                        </Typography>
                        {error ? <Alert severity="error">{error}</Alert> : null}
                    </Stack>
                </Paper>
            </Box>
        </Container>
    );
}
