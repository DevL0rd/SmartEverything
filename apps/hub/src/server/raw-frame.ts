import type { RawData } from 'ws';

export function frameBytes(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  return Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
}

export function frameText(data: RawData): string {
  return frameBytes(data).toString('utf8');
}
