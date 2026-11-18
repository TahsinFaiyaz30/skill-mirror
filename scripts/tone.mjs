import { mkdir, writeFile } from "node:fs/promises";

const rate = 24000;
const tone = Buffer.alloc(44 + rate * 2);
tone.write("RIFF", 0);
tone.writeUInt32LE(tone.length - 8, 4);
tone.write("WAVEfmt ", 8);
tone.writeUInt32LE(16, 16);
tone.writeUInt16LE(1, 20);
tone.writeUInt16LE(1, 22);
tone.writeUInt32LE(rate, 24);
tone.writeUInt32LE(rate * 2, 28);
tone.writeUInt16LE(2, 32);
tone.writeUInt16LE(16, 34);
tone.write("data", 36);
tone.writeUInt32LE(rate * 2, 40);
for (let i = 0; i < rate; i++) {
  const envelope = Math.min(1, i / 480, (rate - i) / 480);
  tone.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / rate) * 6000 * envelope), 44 + i * 2);
}
await mkdir("public/audio", { recursive: true });
await writeFile("public/audio/tone-check.wav", tone);
