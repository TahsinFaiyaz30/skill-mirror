import { VIDEO_RECORD_SIZE } from "@/lib/config/constants";
import type { PlaybackBus } from "./playback";
export async function mixedRecordingStream(stream: MediaStream, playback: PlaybackBus) {
  const context = playback.context;
  const mic = context.createMediaStreamSource(stream);
  const output = context.createMediaStreamDestination(), ai = context.createGain();
  ai.gain.value = .8;
  mic.connect(output); playback.bus.connect(ai); ai.connect(output);
  const video = stream.getVideoTracks()[0].clone();
  await video.applyConstraints({ width: VIDEO_RECORD_SIZE.width, height: VIDEO_RECORD_SIZE.height }).catch(() => {});
  return { stream: new MediaStream([video, ...output.stream.getAudioTracks()]), close: () => { mic.disconnect(); ai.disconnect(); video.stop(); output.stream.getTracks().forEach((t) => t.stop()); } };
}
