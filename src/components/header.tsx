import { AppBar, Box, Container, Toolbar, Typography } from "@mui/material";
import Image from "next/image";
import type { ReactNode } from "react";
import logo from "../assets/images/logo.png";

/**
 * Contains the header element.
 * @returns The page header.
 */
export function Header(): ReactNode {
    return (
        <AppBar component="header" position="static">
            <Container maxWidth="lg">
                <Toolbar disableGutters sx={{ gap: 3, justifyContent: "space-between", py: 1.5 }}>
                    <Box sx={{ alignItems: "center", display: "flex", gap: 2 }}>
                        <Image
                            alt="Bishop's Stortford Rugby Football Club crest"
                            height={56}
                            priority
                            src={logo}
                            width={56}
                        />
                        <Typography sx={{ fontWeight: 700 }} variant="h6">
                            Bishop's Stortford Rugby Football Club
                        </Typography>
                    </Box>
                </Toolbar>
            </Container>
        </AppBar>
    );
}
