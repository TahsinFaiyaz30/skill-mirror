"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [query] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      forcedTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <QueryClientProvider client={query}>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
        <Toaster
          position="bottom-right"
          theme="light"
          toastOptions={{
            style: {
              background: "#ffffff",
              border: "1px solid #e6e8ee",
              color: "#1d2230",
              borderRadius: 14,
              boxShadow: "0 18px 44px -18px rgb(16 24 40 / 0.25)",
            },
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
