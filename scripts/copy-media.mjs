import { cp, mkdir } from "node:fs/promises";

await mkdir("public/mediapipe/wasm", { recursive: true });
await cp("node_modules/@mediapipe/tasks-vision/wasm", "public/mediapipe/wasm", { recursive: true });
await mkdir("public/audio/vad", { recursive: true });
for (const file of ["vad.worklet.bundle.min.js", "silero_vad_legacy.onnx", "silero_vad_v5.onnx"]) {
  await cp("node_modules/@ricky0123/vad-web/dist/" + file, "public/audio/vad/" + file);
}
await cp("node_modules/onnxruntime-web/dist", "public/audio/vad/runtime", {
  recursive: true,
  filter: (path) => !path.includes("dist/") && !path.includes("dist\\") || /\.(wasm|mjs)$/.test(path),
});
