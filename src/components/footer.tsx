import { Box, Container, Typography } from "@mui/material";
import type { ReactNode } from "react";

/**
 * Contains the footer element.
 * @returns The page footer.
 */
export function Footer(): ReactNode {
    const currentYear = new Date().getUTCFullYear();

    return (
        <Box component="footer" sx={{ borderColor: "primary.main", borderTop: 1, py: 2.5 }}>
            <Container maxWidth="lg" sx={{ display: "flex", justifyContent: "center" }}>
                <Typography variant="caption">
                    © {currentYear > 2026 ? `2026-${currentYear}` : currentYear} Oliver Jones
                </Typography>
            </Container>
        </Box>
    );
}
