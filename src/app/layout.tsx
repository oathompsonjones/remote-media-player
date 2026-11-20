import "styles/global.css";
import "styles/background.css";
import type { Metadata, Viewport } from "next";
import { AppThemeProvider } from "contexts/theme-context";
import { Footer } from "components/footer";
import { Header } from "components/header";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import logo from "assets/images/logo.png";

// eslint-disable-next-line new-cap
const inter = Inter({ subsets: ["latin"] });

const structuredData = JSON.stringify({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "@context": "https://schema.org",
    // eslint-disable-next-line @typescript-eslint/naming-convention
    "@type": "SoftwareApplication",
    applicationCategory: "MultimediaApplication",
    author: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "@id": "https://oathompsonjones.co.uk/#person",
    },
    name: "Matchday Display",
    operatingSystem: "Web",
    url: "https://bsrfc-video.oathompsonjones.co.uk",
}).replace(/</gu, "\\u003c");

// https://realfavicongenerator.net (remove the mask icon and msapplication stuff)
export const metadata: Metadata = {
    description: "Manage the current matchday video for Bishop's Stortford Rugby Football Club.",
    icons: {
        apple: logo.src,
        icon: logo.src,
        shortcut: logo.src,
    },
    keywords: [],
    title: "Matchday Display | Bishop's Stortford Rugby Football Club",
};

export const viewport: Viewport = {
    initialScale: 1,
    themeColor: "#003ca5",
    width: "device-width",
};

/**
 * A wrapper to build every page.
 * @param props - The props to pass to the layout.
 * @param props.children - The children to render.
 * @returns A page wrapper.
 */
export default function Layout({ children }: { readonly children: ReactNode; }): ReactNode {
    return (
        <html lang="en">
            <body className={inter.className}>
                <script
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        __html: structuredData,
                    }}
                    type="application/ld+json"
                />
                <AppThemeProvider>
                    <noscript>You need to enable JavaScript to run this app.</noscript>
                    <Header />
                    <main>{children}</main>
                    <Footer />
                </AppThemeProvider>
            </body>
        </html>
    );
}
