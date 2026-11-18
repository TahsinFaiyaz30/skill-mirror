"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [query] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <QueryClientProvider client={query}><MotionConfig reducedMotion="user">{children}</MotionConfig><Toaster position="bottom-right" /></QueryClientProvider>
  </ThemeProvider>;
}
