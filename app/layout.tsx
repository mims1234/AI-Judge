import type { Metadata, Viewport } from "next";
import { Unica_One, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthRoot } from "@/components/auth/AuthRoot";
import { JsonLd } from "@/components/seo/JsonLd";
import { AppShell } from "@/components/ui/AppShell";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { StatusAnnouncerProvider } from "@/components/ui/StatusAnnouncer";
import { getKeyStatusInfo } from "@/lib/server/appSettings";
import {
  SITE_CREATOR,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_OG_DESCRIPTION,
  SITE_OG_TITLE,
  SITE_ORIGIN,
  SITE_TITLE,
} from "@/lib/seo";

const displayFont = Unica_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display-var",
});

const sansFont = Inter({
  subsets: ["latin"],
  variable: "--font-sans-var",
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-var",
});

export const viewport: Viewport = {
  themeColor: "#070b0f",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_CREATOR, url: SITE_ORIGIN }],
  creator: SITE_CREATOR,
  publisher: SITE_CREATOR,
  keywords: SITE_KEYWORDS,
  category: "technology",
  classification: "LLM benchmark / model evaluation",
  referrer: "origin-when-cross-origin",
  formatDetection: { email: false, address: false, telephone: false },
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_ORIGIN,
    siteName: SITE_NAME,
    title: SITE_OG_TITLE,
    description: SITE_OG_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_OG_TITLE,
    description: SITE_OG_DESCRIPTION,
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const keyStatus = getKeyStatusInfo();

  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${sansFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-ink-950 font-sans text-body">
        <JsonLd />
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <StatusAnnouncerProvider>
          <AuthRoot>
            <AppShell serverConfigured={keyStatus.serverConfigured} />
            {/*
              Stacking: main (z-1) must stay above SiteFooter (z-0) so any
              position:fixed docks inside pages (e.g. /run Continue bar) are
              never covered by the credit footer.
            */}
            <main id="main" className="relative z-[1] flex flex-1 flex-col">
              {children}
            </main>
            <SiteFooter />
          </AuthRoot>
        </StatusAnnouncerProvider>
      </body>
    </html>
  );
}
