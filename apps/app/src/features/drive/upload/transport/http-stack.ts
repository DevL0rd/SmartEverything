import type { HttpRequest, HttpResponse, HttpStack } from 'tus-js-client';
import type { TransportAnswer, UploadTransport } from './types';

export const UPLOAD_ENDPOINT = 'http://hub.invalid/drive/uploads/';

const ORIGIN = /^[a-z][a-z0-9+.-]*:\/\/[^/]+/i;

export function pathOf(url: string): string {
  const path = url.replace(ORIGIN, '');
  return path.startsWith('/') ? path : `/${path}`;
}

function bodyOf(body: unknown): Blob | null {
  if (body === null || body === undefined) return null;
  if (body instanceof Blob) return body;
  throw new TypeError('An upload request body must be a Blob.');
}

class AnswerResponse implements HttpResponse {
  constructor(private readonly answer: TransportAnswer) {}

  getStatus(): number {
    return this.answer.status;
  }

  getHeader(header: string): string | undefined {
    return this.answer.headers[header.toLowerCase()];
  }

  getBody(): string {
    return this.answer.body;
  }

  getUnderlyingObject(): unknown {
    return this.answer;
  }
}

class TransportCall implements HttpRequest {
  private readonly headers: Record<string, string> = {};
  private readonly controller = new AbortController();
  private progress: ((bytesSent: number) => void) | null = null;

  constructor(
    private readonly transport: UploadTransport,
    private readonly method: string,
    private readonly url: string,
    private readonly inflight: Set<Promise<unknown>>,
  ) {}

  getMethod(): string {
    return this.method;
  }

  getURL(): string {
    return this.url;
  }

  setHeader(header: string, value: string): void {
    this.headers[header] = value;
  }

  getHeader(header: string): string | undefined {
    return this.headers[header];
  }

  setProgressHandler(handler: (bytesSent: number) => void): void {
    this.progress = handler;
  }

  send(body: unknown): Promise<HttpResponse> {
    const call = this.exchange(bodyOf(body));
    this.inflight.add(call);
    const forget = (): void => {
      this.inflight.delete(call);
    };
    call.then(forget, forget);
    return call;
  }

  private async exchange(payload: Blob | null): Promise<HttpResponse> {
    const answer = await this.transport.send({
      method: this.method,
      path: pathOf(this.url),
      headers: { ...this.headers },
      body: payload,
      signal: this.controller.signal,
    });
    this.progress?.(payload?.size ?? 0);
    return new AnswerResponse(answer);
  }

  abort(): Promise<void> {
    this.controller.abort();
    return Promise.resolve();
  }

  getUnderlyingObject(): unknown {
    return this.controller;
  }
}

export class TransportHttpStack implements HttpStack {
  private readonly inflight = new Set<Promise<unknown>>();

  constructor(private readonly transport: UploadTransport) {}

  createRequest(method: string, url: string): HttpRequest {
    return new TransportCall(this.transport, method, url, this.inflight);
  }

  async settled(): Promise<void> {
    await Promise.allSettled([...this.inflight]);
  }

  getName(): string {
    return 'SmartEverythingHubStack';
  }
}
