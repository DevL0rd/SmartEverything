import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

export class FakeChild extends EventEmitter {
  readonly pid = 4242;
  readonly stdout = new PassThrough();
  readonly stdin = new PassThrough();
  readonly stderr = new PassThrough();
  readonly killed: string[] = [];

  kill = (signal: NodeJS.Signals): boolean => {
    this.killed.push(signal);
    return true;
  };

  exit(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.emit('exit', code, signal);
  }

  fail(message: string): void {
    this.emit('error', new Error(message));
  }
}

export function bytesOf(pcm: Int16Array): Buffer {
  return Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
}
