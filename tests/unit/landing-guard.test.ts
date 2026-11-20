import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mockUser: vi.fn<() => Promise<{ id: string } | null>>(),
  getProfile: vi.fn<
    (id: string) => Promise<{ onboardedAt: Date | null; intent: string } | null>
  >(),
  getOrg: vi.fn<(id: string) => Promise<{ org: { id: string } } | null>>(),
}));

vi.mock("@/lib/config/env", () => ({
  localMock: true,
  publicEnv: {
    appUrl: "http://localhost:3000",
    aiMode: "mock",
    aiDataTier: "unpaid",
    supabaseUrl: undefined,
    supabaseAnonKey: undefined,
  },
}));

vi.mock("@/lib/auth/mock", () => ({
  mockUser: mocks.mockUser,
}));

vi.mock("@/lib/auth/guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/guards")>();
  return {
    ...actual,
    getProfile: mocks.getProfile,
    getOrg: mocks.getOrg,
    authenticatedHome: async (userId: string, preferHiring = false) => {
      const profile = await mocks.getProfile(userId);
      if (!profile?.onboardedAt)
        return profile?.intent === "hiring" || profile?.intent === "practice"
          ? "/onboarding?intent=" + profile.intent
          : "/onboarding";
      if ((profile.intent === "hiring" || preferHiring) && (await mocks.getOrg(userId)))
        return "/hiring";
      return "/dashboard";
    },
  };
});

import { guardRequest } from "@/lib/auth/middleware";

describe("landing page auth redirect guard", () => {
  beforeEach(() => {
    mocks.mockUser.mockReset();
    mocks.getProfile.mockReset();
    mocks.getOrg.mockReset();
  });

  it("allows logged-out visitors on / with strict no-store headers", async () => {
    mocks.mockUser.mockResolvedValue(null);
    const response = await guardRequest(new NextRequest("http://localhost:3000/"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toContain("Cookie");
  });

  it("redirects logged-in practice users from / to /dashboard", async () => {
    mocks.mockUser.mockResolvedValue({ id: "user-practice" });
    mocks.getProfile.mockResolvedValue({
      onboardedAt: new Date("2026-01-01T00:00:00Z"),
      intent: "practice",
    });
    mocks.getOrg.mockResolvedValue(null);

    const response = await guardRequest(new NextRequest("http://localhost:3000/"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("redirects logged-in hiring users from / to /hiring", async () => {
    mocks.mockUser.mockResolvedValue({ id: "user-hiring" });
    mocks.getProfile.mockResolvedValue({
      onboardedAt: new Date("2026-01-01T00:00:00Z"),
      intent: "hiring",
    });
    mocks.getOrg.mockResolvedValue({ org: { id: "org-1" } });

    const response = await guardRequest(new NextRequest("http://localhost:3000/"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/hiring");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("redirects logged-in un-onboarded users from / to /onboarding", async () => {
    mocks.mockUser.mockResolvedValue({ id: "user-new" });
    mocks.getProfile.mockResolvedValue({ onboardedAt: null, intent: "practice" });

    const response = await guardRequest(new NextRequest("http://localhost:3000/"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/onboarding?intent=practice",
    );
  });

  it("keeps org members browsing /hiring inside /hiring when hitting /", async () => {
    mocks.mockUser.mockResolvedValue({ id: "user-dual" });
    mocks.getProfile.mockResolvedValue({
      onboardedAt: new Date("2026-01-01T00:00:00Z"),
      intent: "practice",
    });
    mocks.getOrg.mockResolvedValue({ org: { id: "org-1" } });

    const response = await guardRequest(
      new NextRequest("http://localhost:3000/", {
        headers: { referer: "http://localhost:3000/hiring/openings/abc" },
      }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/hiring");
  });
});
