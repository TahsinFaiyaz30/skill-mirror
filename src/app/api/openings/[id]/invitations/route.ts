export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export {
  listInvites as GET,
  createInvites as POST,
} from "@/lib/api/invitation";
