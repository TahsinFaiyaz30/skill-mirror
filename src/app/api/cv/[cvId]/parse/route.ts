export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Reading a CV can take up to CV_PARSE_TIMEOUT_MS. Keep the platform limit above it.
export const maxDuration = 120;
export { parseCv as POST } from "@/lib/api/cv";
