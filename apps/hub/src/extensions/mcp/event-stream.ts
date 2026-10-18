import type { IncomingMessage, ServerResponse } from 'node:http';
import { NO_STORE } from './respond';

const HEARTBEAT_MS = 25_000;

const EVENT_STREAM = 'text/event-stream';

export function acceptsEventStream(request: IncomingMessage): boolean {
  return (request.headers.accept ?? '').includes(EVENT_STREAM);
}

export class EventStream {
  private readonly heartbeat: NodeJS.Timeout;
  private closer: (() => void) | null = null;

  constructor(private readonly response: ServerResponse) {
    response.writeHead(200, {
      ...NO_STORE,
      'content-type': `${EVENT_STREAM}; charset=utf-8`,
      'x-accel-buffering': 'no',
    });
    response.flushHeaders();
    this.heartbeat = setInterval(() => {
      response.write(': keep-alive\n\n');
    }, HEARTBEAT_MS);
    response.once('close', () => {
      clearInterval(this.heartbeat);
      this.closer?.();
    });
  }

  onClose(closer: () => void): void {
    this.closer = closer;
  }

  send(event: string, data: string): void {
    const lines = data.split('\n').map((line) => `data: ${line}`);
    this.response.write(`event: ${event}\n${lines.join('\n')}\n\n`);
  }

  close(): void {
    this.response.end();
  }
}
