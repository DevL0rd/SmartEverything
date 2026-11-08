export type Bytes = Uint8Array<ArrayBuffer>;

export interface FakeDriveFile {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly parents: readonly string[] | undefined;
  readonly modifiedTime: string;
  readonly content: Bytes | null;
  readonly exports: ReadonlyMap<string, Bytes>;
}

export interface FilePlacement {
  readonly name: string;
  readonly parentId?: string;
  readonly modifiedTime?: string;
}

export function bytesOf(text: string): Bytes {
  return new Uint8Array(Buffer.from(text, 'utf8'));
}

export function jsonReply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8' },
  });
}

export function failure(status: number): Response {
  return jsonReply(status, { error: { code: status, message: 'fake failure' } });
}

export function bytesReply(content: Bytes): Response {
  return new Response(content, {
    status: 200,
    headers: { 'content-type': 'application/octet-stream' },
  });
}
