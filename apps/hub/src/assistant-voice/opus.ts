import { createRequire } from 'node:module';

interface Handler {
  _encode(input: number, bytes: number, output: number, frameSize: number): number;
  _decode(input: number, bytes: number, output: number): number;
}

interface NativeOpus {
  readonly OpusScriptHandler: {
    new (rate: number, channels: number, application: number): Handler;
    destroy_handler(handler: Handler): void;
  };
  readonly HEAPU8: Uint8Array;
  readonly HEAPU16: Uint16Array;
  _malloc(bytes: number): number;
  _free(pointer: number): void;
}

const OPUS_APPLICATION_AUDIO = 2049;
const MAX_FRAME_SAMPLES = 2880;
const MAX_PACKET_BYTES = 1276 * 3;

export class OpusCodecError extends Error {
  override readonly name = 'OpusCodecError';
}

function isNativeOpus(value: unknown): value is NativeOpus {
  return (
    typeof value === 'object' &&
    value !== null &&
    'OpusScriptHandler' in value &&
    '_malloc' in value &&
    'HEAPU8' in value
  );
}

function isFactory(value: unknown): value is () => unknown {
  return typeof value === 'function';
}

function loadNative(): NativeOpus {
  const factory: unknown = createRequire(import.meta.url)(
    'opusscript/build/opusscript_native_wasm.js',
  );
  if (!isFactory(factory)) {
    throw new OpusCodecError('opusscript did not export its wasm module factory');
  }
  const native = factory();
  if (!isNativeOpus(native)) {
    throw new OpusCodecError('opusscript gave a module without the expected exports');
  }
  return native;
}

let shared: NativeOpus | null = null;
const dead = new WeakSet<NativeOpus>();

function nativeModule(): NativeOpus {
  shared ??= loadNative();
  return shared;
}

export class Opus {
  private readonly module = nativeModule();
  private readonly handler: Handler;
  private readonly pcmBytes: number;
  private readonly pcm: number;
  private readonly packet: number;
  private freed = false;

  constructor(
    readonly rate: number,
    readonly channels: number,
  ) {
    this.handler = new this.module.OpusScriptHandler(rate, channels, OPUS_APPLICATION_AUDIO);
    this.pcmBytes = MAX_FRAME_SAMPLES * channels * 2;
    this.pcm = this.module._malloc(this.pcmBytes * 2);
    this.packet = this.module._malloc(MAX_PACKET_BYTES);
  }

  get stale(): boolean {
    return dead.has(this.module);
  }

  decode(packet: Uint8Array): Int16Array {
    if (packet.length > MAX_PACKET_BYTES) {
      throw new OpusCodecError(`An Opus packet of ${String(packet.length)} bytes is too large`);
    }
    return this.guard(() => {
      this.module.HEAPU8.set(packet, this.packet);
      const samples = this.handler._decode(this.packet, packet.length, this.pcm);
      if (samples < 0) {
        throw new OpusCodecError(`libopus could not decode a packet (${String(samples)})`);
      }
      const slots = this.slots(samples * this.channels * 2);
      return new Int16Array(Uint8Array.from(slots).buffer);
    });
  }

  encode(pcm: Int16Array, frameSize: number): Buffer {
    if (pcm.byteLength > this.pcmBytes || frameSize * this.channels > pcm.length) {
      throw new OpusCodecError(`A frame of ${String(pcm.length)} samples cannot be encoded`);
    }
    return this.guard(() => {
      this.slots(pcm.byteLength).set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
      const bytes = this.handler._encode(this.pcm, pcm.byteLength, this.packet, frameSize);
      if (bytes < 0) {
        throw new OpusCodecError(`libopus could not encode a frame (${String(bytes)})`);
      }
      return Buffer.from(this.module.HEAPU8.slice(this.packet, this.packet + bytes));
    });
  }

  free(): void {
    if (this.freed) {
      return;
    }
    this.freed = true;
    if (this.stale) {
      return;
    }
    this.module.OpusScriptHandler.destroy_handler(this.handler);
    this.module._free(this.pcm);
    this.module._free(this.packet);
  }

  private slots(bytes: number): Uint16Array {
    const start = this.pcm / 2;
    return this.module.HEAPU16.subarray(start, start + bytes);
  }

  private guard<T>(work: () => T): T {
    if (this.freed) {
      throw new OpusCodecError('An Opus codec was used after it was freed');
    }
    try {
      return work();
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'RuntimeError') {
        dead.add(this.module);
        if (shared === this.module) {
          shared = null;
        }
      }
      throw cause;
    }
  }
}
