// Kept as a standalone worklet so it runs without imports on the audio rendering thread.
declare abstract class AudioWorkletProcessor { readonly port: MessagePort }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]) {
    const channel = inputs[0]?.[0];
    if (channel) this.port.postMessage(channel);
    return true;
  }
}
registerProcessor("pcm-capture", CaptureProcessor);
export {};
