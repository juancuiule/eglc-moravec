import { AuthBoot } from "@/auth/AuthBoot";
import { SiteCredit } from "@/components/SiteCredit";
import { SyncChip } from "@/components/SyncChip";
import { QueryProvider } from "@/providers/QueryProvider";
import type { Metadata, Viewport } from "next";
import { Overpass_Mono } from "next/font/google";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import "./globals.css";

const overpassMono = Overpass_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-overpass-mono",
});

const gotham = localFont({
  src: [
    {
      path: "../public/og-fonts/Gotham-Book.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/og-fonts/Gotham-Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/og-fonts/Gotham-Bold.otf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/og-fonts/Gotham-Black.otf",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-gotham",
  display: "swap",
});

// Public origin for absolute og:/twitter: URLs — crawlers can't resolve
// relative image paths without it. Override on self-hosts; the default is
// the production domain.
const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://moravec.elgatoylacaja.com";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("Meta");
  return {
    metadataBase: new URL(appUrl),
    title: "Moravec - Cognición Aritmética",
    description: t("description"),
    icons: {
      icon: "/moravec.svg",
    },
    openGraph: {
      type: "website",
      siteName: "EGLC Moravec",
      title: "Moravec - Cognición Aritmética",
      description: t("description"),
      url: "/",
      locale: locale === "es" ? "es_ES" : "en_US",
      alternateLocale: locale === "es" ? "en_US" : "es_ES",
    },
    twitter: {
      card: "summary_large_image",
    },
    // app/opengraph-image.tsx supplies og:image + twitter:image.
  };
}

// viewportFit: "cover" lets content draw under the notch/home indicator on
// iOS instead of Safari letterboxing it — paired with the safe-area padding
// below. maximumScale is intentionally left unset so pinch-zoom still works.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${gotham.variable} ${overpassMono.variable}`}
    >
      <body className="min-h-dvh flex flex-col bg-base text-foreground font-sans">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <QueryProvider>
            <AuthBoot />
            {/* Top-aligned rather than centered, paired with `panel`'s fixed max-width,
                so navigating between screens of different heights doesn't shift the surface.
                Every side is a longhand pl-/pr-/pt-/pb- utility (never the p- or sm:p-
                shorthand) so each one can fold in that side's safe-area inset without any
                shorthand-vs-longhand ordering ambiguity. The inline-inset floor is tighter
                below sm: a phone's own bezel already provides some clearance, and the
                panel adds its own p-6/p-8 on top, so stacking a full 24px margin here on a
                320-375px screen ate too much of the calculator keypad's width. left/right
                (not just top) carry the safe-area-inset because a landscape iPhone's notch
                becomes a *side* inset, not a top one. No bottom padding: SiteCredit
                follows the panel and owns the bottom spacing (see it). */}
            <main
              className={[
                "flex items-start justify-center",
                "pt-[max(1.5rem,env(safe-area-inset-top))]",
                "pl-[max(0.75rem,env(safe-area-inset-left))]",
                "pr-[max(0.75rem,env(safe-area-inset-right))]",
                "sm:pt-[max(3rem,env(safe-area-inset-top))]",
                "sm:pl-[max(1.5rem,env(safe-area-inset-left))]",
                "sm:pr-[max(1.5rem,env(safe-area-inset-right))]",
              ].join(" ")}
            >
              {children}
            </main>
            <SiteCredit />
            <SyncChip />
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
