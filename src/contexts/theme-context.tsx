"use client";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import type { ReactNode } from "react";

const colours = {
    blue: "#003ca5",
    pink: "#e01583",
    red: "#e80029",
    white: "#ffffff",
};

const theme = createTheme({
    palette: {
        background: {
            default: colours.white,
            paper: colours.white,
        },
        error: { main: colours.red },
        primary: { main: colours.blue },
        secondary: { main: colours.pink },
        text: {
            primary: colours.blue,
            secondary: colours.pink,
        },
    },
    shape: { borderRadius: 0 },
    typography: {
        button: {
            fontWeight: 700,
            textTransform: "none",
        },
        fontFamily: "Inter, sans-serif",
        h1: {
            fontWeight: 500,
            letterSpacing: 0,
        },
        h2: {
            fontWeight: 500,
            letterSpacing: 0,
        },
    },
});

/**
 * Provides the shared MUI theme and baseline styles.
 * @param root0 - The provider props.
 * @param root0.children - The application content.
 * @returns The themed application content.
 */
export function AppThemeProvider({ children }: { readonly children: ReactNode; }): ReactNode {
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
        </ThemeProvider>
    );
}
