import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/common/providers";
import "./globals.css";

const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-ui",
  display: "swap",
});
const mono = localFont({
  src: "../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-numbers",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "SkillMirror", template: "%s · SkillMirror" },
  description:
    "Pressure-tested interviews. Every answer, every gesture, every second.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={inter.variable + " " + mono.variable}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
