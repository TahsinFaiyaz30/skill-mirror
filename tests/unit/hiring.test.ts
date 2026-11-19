import { describe, expect, it, vi } from "vitest";
import { csvCell, encodeCSV, parseCandidateCsv } from "@/lib/hiring/csv";
import {
  emailMatches,
  maskEmail,
  newInviteToken,
} from "@/lib/hiring/invitations";
import { enrichProjects, repositoryPath } from "@/lib/hiring/github";
describe("hiring helpers", () => {
  it("only fetches project content after GitHub confirms public visibility", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({ private: true, visibility: "private" }),
      );
    try {
      expect(
        await enrichProjects(
          ["https://github.com/team/engine"],
          "fixture-token",
        ),
      ).toEqual([]);
      expect(fetch).toHaveBeenCalledTimes(1);
      fetch
        .mockResolvedValueOnce(
          Response.json({
            private: false,
            visibility: "public",
            name: "engine",
          }),
        )
        .mockResolvedValueOnce(Response.json({ TypeScript: 1 }))
        .mockResolvedValueOnce(new Response("Project notes"));
      const projects = await enrichProjects(
        ["https://github.com/team/engine"],
        "fixture-token",
      );
      expect(projects[0].summary).toContain("Project notes");
      for (const [, options] of fetch.mock.calls.slice(2))
        expect(new Headers(options?.headers).has("authorization")).toBe(false);
    } finally {
      fetch.mockRestore();
    }
  });
  it("writes UTF-8 BOM, RFC 4180 quoting and spreadsheet-safe cells", () => {
    expect(
      encodeCSV([
        ["Name", "Note"],
        ["=SUM(1,2)", 'A "quoted" note'],
        ["Jamie", "first\nsecond"],
      ]),
    ).toBe(
      '\uFEFFName,Note\r\n"\'=SUM(1,2)","A ""quoted"" note"\r\nJamie,"first\nsecond"\r\n',
    );
    for (const marker of ["=", "+", "-", "@", "\t", "\r"])
      expect(csvCell(marker + "Cell")).toContain("'" + marker);
    expect(csvCell(null)).toBe("");
  });
  it("parses quoted names and an optional CSV header", () => {
    expect(
      parseCandidateCsv('\uFEFFemail,name\r\nj@example.com,"Jamie, Jr."\r\n'),
    ).toEqual([{ email: "j@example.com", name: "Jamie, Jr." }]);
  });
  it("keeps the token unguessable and only exposes the mask", () => {
    expect(newInviteToken()).toMatch(/^[\w-]{43}$/);
    expect(maskEmail("jamie@example.com")).toBe("j***@example.com");
    expect(emailMatches("Jamie@example.com", "jamie@example.com")).toBe(true);
  });
  it("accepts only explicit GitHub repository links", () => {
    expect(repositoryPath("https://github.com/team/engine")).toBe(
      "team/engine",
    );
    expect(repositoryPath("https://github.com/team")).toBeNull();
    expect(
      repositoryPath("https://github.com.evil.test/team/engine"),
    ).toBeNull();
  });
});
