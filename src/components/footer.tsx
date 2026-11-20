import { Box, Container, Typography } from "@mui/material";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Contains the footer element.
 * @returns The page footer.
 */
export function Footer(): ReactNode {
    const currentYear = new Date().getUTCFullYear();

    return (
        <Box component="footer" sx={{ py: 1 }}>
            <Container
                maxWidth="lg"
                sx={{
                    alignItems: "center",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                }}
            >
                <Typography variant="caption">
                    © {currentYear > 2026 ? `2026-${currentYear}` : currentYear} Oliver Jones
                </Typography>
                <Typography variant="caption">
                    Website designed and developed by{" "}
                    <Link href="https://oathompsonjones.co.uk">Oliver Jones (oathompsonjones)</Link>.
                </Typography>
            </Container>
        </Box>
    );
}
