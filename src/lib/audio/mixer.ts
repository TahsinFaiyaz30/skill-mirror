import { VIDEO_RECORD_SIZE } from "@/lib/config/constants";
import type { PlaybackBus } from "./playback";
export async function mixedRecordingStream(
  stream: MediaStream,
  playback: PlaybackBus,
) {
  const context = playback.context;
  let mic = context.createMediaStreamSource(stream);
  const output = context.createMediaStreamDestination(),
    micOutput = context.createMediaStreamDestination(),
    ai = context.createGain();
  ai.gain.value = 0.8;
  mic.connect(output);
  mic.connect(micOutput);
  playback.bus.connect(ai);
  ai.connect(output);
  async function cloneCamera(track: MediaStreamTrack) {
    const camera = track.clone();
    await camera
      .applyConstraints({
        width: VIDEO_RECORD_SIZE.width,
        height: VIDEO_RECORD_SIZE.height,
      })
      .catch(() => {});
    return camera;
  }
  let video = await cloneCamera(stream.getVideoTracks()[0]);
  const recording = new MediaStream([video, ...output.stream.getAudioTracks()]);
  return {
    stream: recording,
    microphone: micOutput.stream,
    replaceMicrophone(track: MediaStreamTrack) {
      mic.disconnect();
      mic = context.createMediaStreamSource(new MediaStream([track]));
      mic.connect(output);
      mic.connect(micOutput);
    },
    async replaceCamera(track: MediaStreamTrack) {
      const next = await cloneCamera(track);
      recording.removeTrack(video);
      video.stop();
      recording.addTrack(next);
      video = next;
    },
    close() {
      mic.disconnect();
      ai.disconnect();
      video.stop();
      [...output.stream.getTracks(), ...micOutput.stream.getTracks()].forEach(
        (track) => track.stop(),
      );
    },
  };
}
