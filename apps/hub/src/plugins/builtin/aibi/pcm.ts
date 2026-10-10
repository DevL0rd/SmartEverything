const SAMPLE_BYTES = 2;

export class BigEndianPcm {
  private carry: number | null = null;

  push(chunk: Buffer): Int16Array {
    const bytes = this.carry === null ? chunk : Buffer.concat([Buffer.from([this.carry]), chunk]);
    const usable = bytes.length - (bytes.length % SAMPLE_BYTES);
    this.carry = usable < bytes.length ? bytes.readUInt8(usable) : null;
    const samples = new Int16Array(usable / SAMPLE_BYTES);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = bytes.readInt16BE(index * SAMPLE_BYTES);
    }
    return samples;
  }
}

export function rms(samples: Int16Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let total = 0;
  for (const sample of samples) {
    total += sample * sample;
  }
  return Math.sqrt(total / samples.length);
}
