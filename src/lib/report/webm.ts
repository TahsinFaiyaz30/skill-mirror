type Element = {
  id: number;
  start: number;
  data: number;
  end: number;
  unknown: boolean;
};
const segmentId = 0x18538067;
const clusterId = 0x1f43b675;
const timestampId = 0xe7;
const infoId = 0x1549a966;
const scaleId = 0x2ad7b1;
const tracksId = 0x1654ae6b;
const segmentChildren = new Set([
  0x114d9b74,
  infoId,
  tracksId,
  clusterId,
  0x1c53bb6b,
  0x1941a469,
  0x1043a770,
  0x1254c367,
]);

function encodedLength(first: number) {
  if (!first) throw new Error("Invalid EBML number");
  let size = 1;
  for (let marker = 128; !(first & marker); marker >>= 1) size++;
  return size;
}
function element(bytes: Buffer, start: number, limit: number): Element {
  if (start >= limit) throw new Error("Unexpected end of EBML data");
  const idSize = encodedLength(bytes[start]);
  const sizeAt = start + idSize;
  if (idSize > 4 || sizeAt >= limit) throw new Error("Invalid EBML element ID");
  const id = bytes.readUIntBE(start, idSize);
  const sizeLength = encodedLength(bytes[sizeAt]);
  const data = sizeAt + sizeLength;
  if (data > limit) throw new Error("Invalid EBML size");
  const first = bytes[sizeAt] & (255 >> sizeLength);
  let n = BigInt(first),
    unknown = first === 255 >> sizeLength;
  for (let offset = sizeAt + 1; offset < data; offset++) {
    n = n * BigInt(256) + BigInt(bytes[offset]);
    unknown &&= bytes[offset] === 255;
  }
  if (!unknown && n > BigInt(limit - data))
    throw new Error("Truncated EBML element");
  return { id, start, data, end: unknown ? limit : data + Number(n), unknown };
}
function integer(bytes: Buffer, entry: Element) {
  const size = entry.end - entry.data;
  if (entry.unknown || size < 1 || size > 6)
    throw new Error("Invalid WebM timestamp");
  return bytes.readUIntBE(entry.data, size);
}
function children(bytes: Buffer, parent: Element) {
  const results: Element[] = [];
  for (let offset = parent.data; offset < parent.end;) {
    const child = element(bytes, offset, parent.end);
    if (child.unknown) throw new Error("Unexpected indefinite EBML element");
    results.push(child);
    offset = child.end;
  }
  return results;
}
function cluster(bytes: Buffer, entry: Element) {
  let stamp: Element | undefined;
  let end = entry.data;
  while (end < entry.end) {
    const item = element(bytes, end, entry.end);
    if (entry.unknown && segmentChildren.has(item.id)) break;
    if (item.unknown) throw new Error("Invalid WebM cluster child");
    if (item.id === timestampId) stamp = item;
    end = item.end;
  }
  if (!stamp) throw new Error("Missing WebM cluster timestamp");
  return { start: entry.start, end, stamp, time: integer(bytes, stamp) };
}
type Chunk = { bytes: Buffer; offsetMs: number };
const tenMinutes = 600_000;

/** Browser recordings use one set of audio tracks followed by timestamped clusters. */
export function splitMicrophoneWebm(
  bytes: Buffer,
  limit = 24 * 1024 * 1024,
  lengthMs = tenMinutes,
): Chunk[] {
  if (bytes.length <= limit) return [{ bytes, offsetMs: 0 }];
  const ebml = element(bytes, 0, bytes.length);
  if (ebml.id !== 0x1a45dfa3 || ebml.unknown)
    throw new Error("Missing WebM header");
  const segment = element(bytes, ebml.end, bytes.length);
  if (segment.id !== segmentId) throw new Error("Missing WebM segment");
  const header: Buffer[] = [
    bytes.subarray(0, ebml.end),
    Buffer.from([0x18, 0x53, 0x80, 0x67, 0xff]),
  ];
  const clusters: ReturnType<typeof cluster>[] = [];
  let scale = 1_000_000,
    hasTracks = false;
  for (let offset = segment.data; offset < segment.end;) {
    const entry = element(bytes, offset, segment.end);
    if (entry.id === clusterId) {
      const parsed = cluster(bytes, entry);
      clusters.push(parsed);
      offset = parsed.end;
      continue;
    }
    if (entry.unknown)
      throw new Error("Unexpected indefinite WebM segment child");
    if (entry.id === infoId || entry.id === tracksId)
      header.push(bytes.subarray(entry.start, entry.end));
    if (entry.id === tracksId) hasTracks = true;
    if (entry.id === infoId) {
      const units = children(bytes, entry).find(
        (entry) => entry.id === scaleId,
      );
      if (units) scale = integer(bytes, units);
    }
    offset = entry.end;
  }
  if (!clusters.length || !hasTracks || !scale)
    throw new Error("Incomplete microphone WebM");
  const headerBytes = header.reduce((size, part) => size + part.length, 0);
  const output: Chunk[] = [];
  let part: Buffer[] = [],
    partBytes = headerBytes,
    origin = 0;
  const append = () => {
    if (part.length)
      output.push({
        bytes: Buffer.concat([...header, ...part]),
        offsetMs: Math.round((origin * scale) / 1_000_000),
      });
  };
  for (const item of clusters) {
    const count = item.end - item.start;
    if (headerBytes + count > limit)
      throw new Error("A microphone cluster exceeds the transcription limit");
    if (
      part.length &&
      (((item.time - origin) * scale) / 1_000_000 >= lengthMs ||
        partBytes + count > limit)
    ) {
      append();
      part = [];
      partBytes = headerBytes;
    }
    if (!part.length) origin = item.time;
    const contents = Buffer.from(bytes.subarray(item.start, item.end));
    contents.writeUIntBE(
      item.time - origin,
      item.stamp.data - item.start,
      item.stamp.end - item.stamp.data,
    );
    part.push(contents);
    partBytes += count;
  }
  append();
  return output;
}
