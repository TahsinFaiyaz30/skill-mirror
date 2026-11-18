import { expect, it } from "vitest";
import { splitMicrophoneWebm } from "@/lib/report/webm";

it("splits large WebM input at cluster boundaries and rebases the timestamps", () => {
  const id = (hex: string) => Buffer.from(hex, "hex");
  const elem = (hex: string, data: Buffer) =>
    Buffer.concat([id(hex), Buffer.from([0x80 + data.length]), data]);
  const cluster = (time: number) => {
    const timestamp = Buffer.alloc(4);
    timestamp.writeUInt32BE(time, 0);
    return elem(
      "1f43b675",
      Buffer.concat([
        elem("e7", timestamp),
        elem("a3", Buffer.from([1, 2, 3])),
      ]),
    );
  };
  const prefix = Buffer.concat([
    elem("1a45dfa3", Buffer.alloc(0)),
    id("18538067ff"),
    elem("1549a966", Buffer.alloc(0)),
    elem("1654ae6b", Buffer.alloc(0)),
  ]);
  const input = Buffer.concat([
    prefix,
    cluster(0),
    cluster(1000),
    cluster(601000),
  ]);
  const parts = splitMicrophoneWebm(input, input.length - 1);
  expect(parts.map((part) => part.offsetMs)).toEqual([0, 601000]);
  expect(parts[1].bytes).toEqual(Buffer.concat([prefix, cluster(0)]));
  expect(parts[0].bytes.length).toBeLessThan(input.length);
  expect(splitMicrophoneWebm(input)).toEqual([{ bytes: input, offsetMs: 0 }]);
});
