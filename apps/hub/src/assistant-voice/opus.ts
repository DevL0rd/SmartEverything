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
const PCM_SLOT_BYTES = 2;
const MAX_PACKET_BYTES = 1276 * 3;

export class OpusCodecError extends Error {
  override readonly name = 'OpusCodecError';
}

function isNativeOpus(value: unknown): value is NativeOpus {
  return typeof value === 'object' && value !== null && 'OpusScriptHandler' in value;
}

function isFactory(value: unknown): value is () => unknown {
  return typeof value === 'function';
}

function loadNative(): NativeOpus {
  const factory: unknown = createRequire(import.meta.url)(
    'opusscript/build/opusscript_native_wasm.js',
  );
  const native = isFactory(factory) ? factory() : null;
  if (!isNativeOpus(native)) {
    throw new OpusCodecError('opusscript did not provide its wasm module');
  }
  return native;
}

const native = loadNative();

export class Opus {
  private readonly handler: Handler;
  private readonly pcm: number;
  private readonly packet: number;
  private freed = false;

  constructor(
    rate: number,
    private readonly channels: number,
  ) {
    this.handler = new native.OpusScriptHandler(rate, channels, OPUS_APPLICATION_AUDIO);
    this.pcm = native._malloc(MAX_FRAME_SAMPLES * channels * 2 * PCM_SLOT_BYTES);
    this.packet = native._malloc(MAX_PACKET_BYTES);
  }

  decode(packet: Uint8Array): Int16Array {
    this.assertLive();
    if (packet.length > MAX_PACKET_BYTES) {
      throw new OpusCodecError(`An Opus packet of ${String(packet.length)} bytes is too large`);
    }
    native.HEAPU8.set(packet, this.packet);
    const samples = this.handler._decode(this.packet, packet.length, this.pcm);
    if (samples < 0) {
      throw new OpusCodecError(`Opus could not decode a packet (${String(samples)})`);
    }
    return new Int16Array(Uint8Array.from(this.slots(samples * this.channels * 2)).buffer);
  }

  encode(pcm: Int16Array, frameSize: number): Buffer {
    this.assertLive();
    this.slots(pcm.byteLength).set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    const bytes = this.handler._encode(this.pcm, pcm.byteLength, this.packet, frameSize);
    if (bytes < 0) {
      throw new OpusCodecError(`Opus could not encode a frame (${String(bytes)})`);
    }
    return Buffer.from(native.HEAPU8.slice(this.packet, this.packet + bytes));
  }

  free(): void {
    if (this.freed) {
      return;
    }
    this.freed = true;
    native.OpusScriptHandler.destroy_handler(this.handler);
    native._free(this.pcm);
    native._free(this.packet);
  }

  private assertLive(): void {
    if (this.freed) {
      throw new OpusCodecError('An Opus codec was used after it was freed');
    }
  }

  private slots(bytes: number): Uint16Array {
    const start = this.pcm / 2;
    return native.HEAPU16.subarray(start, start + bytes);
  }
}
