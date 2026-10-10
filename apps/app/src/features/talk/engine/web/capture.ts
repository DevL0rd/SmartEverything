const BITRATE = 24_000;
const FRAME_US = 20_000;
const LEVEL_EVERY_MS = 80;

export interface Capture {
  readonly stop: () => void;
}

export interface CaptureHandlers {
  readonly onPacket: (packet: Uint8Array) => void;
  readonly onLevel: (level: number) => void;
  readonly onFailure: (error: unknown) => void;
}

export interface MicrophoneOptions {
  readonly noiseSuppression: boolean;
  readonly autoGainControl: boolean;
  readonly deviceId: string | null;
}

const DEFAULT_MICROPHONE: MicrophoneOptions = {
  noiseSuppression: true,
  autoGainControl: true,
  deviceId: null,
};

export function openMicrophone(
  options: MicrophoneOptions = DEFAULT_MICROPHONE,
): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: options.noiseSuppression,
      autoGainControl: options.autoGainControl,
      ...(options.deviceId === null ? {} : { deviceId: { ideal: options.deviceId } }),
    },
    video: false,
  });
}

function levelOf(data: AudioData): number {
  const samples = new Float32Array(data.numberOfFrames);
  data.copyTo(samples, { planeIndex: 0, format: 'f32-planar' });
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.min(1, Math.sqrt(sum / Math.max(1, samples.length)) * 4);
}

function encoderFor(handlers: CaptureHandlers): AudioEncoder {
  return new AudioEncoder({
    output: (chunk): void => {
      const packet = new Uint8Array(chunk.byteLength);
      chunk.copyTo(packet);
      handlers.onPacket(packet);
    },
    error: handlers.onFailure,
  });
}

async function pump(
  reader: ReadableStreamDefaultReader<AudioData>,
  encoder: AudioEncoder,
  handlers: CaptureHandlers,
): Promise<void> {
  let levelAt = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    const data = read.value;
    if (encoder.state === 'unconfigured') {
      encoder.configure({
        codec: 'opus',
        sampleRate: data.sampleRate,
        numberOfChannels: data.numberOfChannels,
        bitrate: BITRATE,
        opus: { frameDuration: FRAME_US, complexity: 5 },
      });
    }
    if (performance.now() - levelAt > LEVEL_EVERY_MS) {
      levelAt = performance.now();
      handlers.onLevel(levelOf(data));
    }
    if (encoder.state === 'configured') {
      encoder.encode(data);
    }
    data.close();
  }
}

export function startCapture(stream: MediaStream, handlers: CaptureHandlers): Capture {
  const [track] = stream.getAudioTracks();
  if (track === undefined) {
    throw new Error('The microphone gave no audio track.');
  }
  const reader = new MediaStreamTrackProcessor<AudioData>({ track }).readable.getReader();
  const encoder = encoderFor(handlers);
  pump(reader, encoder, handlers).catch(handlers.onFailure);
  return {
    stop: (): void => {
      stream.getTracks().forEach((each) => {
        each.stop();
      });
      reader.cancel().catch(handlers.onFailure);
      if (encoder.state === 'configured') {
        encoder.flush().then(() => {
          encoder.close();
        }, handlers.onFailure);
      }
      handlers.onLevel(0);
    },
  };
}
