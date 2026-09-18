import "styles/global.css";
import type { Metadata, Viewport } from "next";
import { AppThemeProvider } from "contexts/theme-context";
import { Footer } from "components/footer";
import { Header } from "components/header";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";

// eslint-disable-next-line new-cap
const inter = Inter({ subsets: ["latin"] });

// https://realfavicongenerator.net (remove the mask icon and msapplication stuff)
export const metadata: Metadata = {
    description: "My website description.",
    icons: {
        apple: "https://cdn.worldvectorlogo.com/logos/next-js.svg",
        icon: [],
        shortcut: "https://cdn.worldvectorlogo.com/logos/next-js.svg",
    },
    keywords: [],
    title: "My Website",
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
