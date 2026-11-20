"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { ThemeProvider, useTheme } from "next-themes";
import { useState } from "react";
import { Toaster } from "sonner";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      toastOptions={{
        style: {
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          color: "var(--foreground)",
          borderRadius: 14,
          boxShadow: "var(--shadow)",
        },
      }}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [query] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      // Dark mode only for now. forcedTheme also overrides a "light" choice a
      // visitor saved before the switcher was removed. To bring light mode
      // back, drop forcedTheme and restore the ThemeToggle in the headers.
      forcedTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <QueryClientProvider client={query}>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
        <ThemedToaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
