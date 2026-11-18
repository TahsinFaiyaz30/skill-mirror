import type { NextConfig } from "next";
const config: NextConfig = {
  agentRules: false,
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "mammoth"],
  outputFileTracingIncludes: { "/*": ["./supabase/migrations/*.sql"] },
  outputFileTracingExcludes: {
    "/*": [
      "./.skill-mirror/**",
      "./.env*",
      "./output/**",
      "./test-results/**",
      "./spec/**",
    ],
  },
};
export default config;
