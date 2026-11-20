import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import localFont from "next/font/local";
import { Providers } from "@/components/common/providers";
import "./globals.css";

// Huru's pairing: Bricolage Grotesque for headings, Plus Jakarta Sans for text.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const ui = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});
const code = localFont({
  src: "../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-code",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "SkillMirror", template: "%s · SkillMirror" },
  description:
    "AI mock interviews that adapt to you and show you exactly what to fix.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#151923" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={display.variable + " " + ui.variable + " " + code.variable}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
