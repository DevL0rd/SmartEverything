import type { RawData } from 'ws';

export interface MessageSocket {
  on(event: 'open', listener: () => void): unknown;
  on(event: 'message', listener: (data: RawData) => void): unknown;
  on(event: 'close', listener: (code: number) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  send(data: string): void;
  ping(): void;
  terminate(): void;
}
