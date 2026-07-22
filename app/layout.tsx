import type { Metadata } from "next";
import { Unica_One, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/ui/AppShell";
import { StatusAnnouncerProvider } from "@/components/ui/StatusAnnouncer";
import { getKeyStatusInfo } from "@/lib/server/appSettings";

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

export const metadata: Metadata = {
  title: {
    default: "AI Judge",
    template: "%s · AI Judge",
  },
  description:
    "One bundle. Three independent judges. Reproducible rankings.",
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
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <StatusAnnouncerProvider>
          <AppShell serverConfigured={keyStatus.serverConfigured} />
          <main id="main" className="relative z-[1] flex flex-1 flex-col">
            {children}
          </main>
        </StatusAnnouncerProvider>
      </body>
    </html>
  );
}
