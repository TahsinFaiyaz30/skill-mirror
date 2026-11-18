import type { NextRequest } from "next/server";
import { guardRequest } from "./lib/auth/middleware";
export function proxy(request: NextRequest) {
  return guardRequest(request);
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|wav|png|jpg|task|wasm|js|mjs|onnx)$).*)",
  ],
};
