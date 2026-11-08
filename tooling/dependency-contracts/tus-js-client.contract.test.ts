import { describe, expect, it } from 'vitest';
import { Upload, type HttpRequest, type HttpResponse, type HttpStack } from 'tus-js-client';

type UploadOptions = ConstructorParameters<typeof Upload>[1];
import { APP_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

interface Sent {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

class RecordingStack implements HttpStack {
  readonly sent: Sent[] = [];

  createRequest(method: string, url: string): HttpRequest {
    const headers: Record<string, string> = {};
    const sent = this.sent;
    return {
      getMethod: (): string => method,
      getURL: (): string => url,
      setHeader: (name: string, value: string): void => {
        headers[name] = value;
      },
      getHeader: (name: string): string | undefined => headers[name],
      setProgressHandler: (): void => undefined,
      send: (): Promise<HttpResponse> => {
        sent.push({ method, url, headers: { ...headers } });
        return Promise.resolve(answerTo(method));
      },
      abort: (): Promise<void> => Promise.resolve(),
      getUnderlyingObject: (): null => null,
    };
  }

  getName(): string {
    return 'recording';
  }
}

const ANSWERS: Readonly<Record<string, { status: number; values: Record<string, string> }>> = {
  POST: { status: 201, values: { Location: 'http://hub.invalid/drive/uploads/one' } },
  HEAD: { status: 200, values: { 'Upload-Offset': '0', 'Upload-Length': '5' } },
  PATCH: { status: 204, values: { 'Upload-Offset': '5' } },
  DELETE: { status: 204, values: {} },
};

function answerTo(method: string): HttpResponse {
  const answer = ANSWERS[method];
  if (answer === undefined) throw new Error(`unexpected ${method}`);
  return {
    getStatus: (): number => answer.status,
    getHeader: (name: string): string | undefined => answer.values[name],
    getBody: (): string => '',
    getUnderlyingObject: (): null => null,
  };
}

function completion(stack: HttpStack, extra: UploadOptions): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const upload = new Upload(Buffer.from('hello'), {
      retryDelays: null,
      httpStack: stack,
      fingerprint: (): Promise<string> => Promise.resolve('one'),
      storeFingerprintForResuming: false,
      onSuccess: (): void => {
        resolve();
      },
      onError: reject,
      ...extra,
    });
    upload.start();
  });
}

describe('tus-js-client contract', () => {
  it('is declared at the installed version by the app', () => {
    expect(declaredVersion(APP_MANIFEST, 'tus-js-client')).toBe(installedVersion('tus-js-client'));
  });

  it('creates a session with the length and metadata headers and patches it from the offset', async () => {
    const stack = new RecordingStack();
    await completion(stack, {
      endpoint: 'http://hub.invalid/drive/uploads/',
      metadata: { filename: 'a.txt' },
    });
    expect(stack.sent.map((one) => one.method)).toEqual(['POST', 'PATCH']);
    expect(stack.sent[0]?.headers).toMatchObject({
      'Tus-Resumable': '1.0.0',
      'Upload-Length': '5',
      'Upload-Metadata': `filename ${Buffer.from('a.txt').toString('base64')}`,
    });
    expect(stack.sent[1]).toMatchObject({
      url: 'http://hub.invalid/drive/uploads/one',
      headers: { 'Upload-Offset': '0', 'Content-Type': 'application/offset+octet-stream' },
    });
  });

  it('resumes a known session with a HEAD request for the offset and terminates with a DELETE', async () => {
    const stack = new RecordingStack();
    await completion(stack, { uploadUrl: 'http://hub.invalid/drive/uploads/one' });
    expect(stack.sent.map((one) => one.method)).toEqual(['HEAD', 'PATCH']);
    await Upload.terminate('http://hub.invalid/drive/uploads/one', { httpStack: stack });
    expect(stack.sent.at(-1)?.method).toBe('DELETE');
  });
});
