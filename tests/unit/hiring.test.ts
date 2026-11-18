import { describe, expect, it } from "vitest";
import { csvCell, encodeCSV, parseCandidateCsv } from "@/lib/hiring/csv";
import {
  emailMatches,
  maskEmail,
  newInviteToken,
} from "@/lib/hiring/invitations";
import { repositoryPath } from "@/lib/hiring/github";
describe("hiring helpers", () => {
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
