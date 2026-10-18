import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { DSH_WRITER_CLAIM } from '@smarteverything/domain';
import type { HarnessCallRequest } from '@smarteverything/domain/node/harness-frames';
import { HARNESS_BOOT } from '../src/process/boot';
import { nativeAttachmentParts, transferAttachments } from '../src/process/attachments';
import { HarnessHub, type HarnessCallPort } from '../src/process/http';
import { bootRuntime } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
});

const TEXT = (bytes: number): Uint8Array =>
  new TextEncoder().encode('line of text\n'.repeat(bytes));

describe('a text attachment given to the model', () => {
  it('reads a small file inline', async () => {
    fixture = await bootRuntime();
    const data = TEXT(10);
    const parts = await nativeAttachmentParts(fixture.runtime, {
      name: 'notes.txt',
      mime: 'text/plain',
      data,
      transcript: null,
    });
    expect(parts).toContainEqual({
      type: 'text',
      text: `[Attached file: notes.txt]\n${new TextDecoder().decode(data)}`,
    });
  });

  it('points at the stored file when it is too large to read inline', async () => {
    fixture = await bootRuntime();
    const data = TEXT(20_000);
    const parts = await nativeAttachmentParts(fixture.runtime, {
      name: 'big.txt',
      mime: 'text/plain',
      data,
      transcript: null,
    });
    const note = parts.find((part) => part.type === 'text');
    const file = parts.find((part) => part.type === 'file');
    if (note?.type !== 'text' || file?.type !== 'file')
      throw new Error('expected a note and a stored file');
    const path = fixture.runtime.attachmentPath(file.attachment);
    expect(path).toBeDefined();
    expect(note.text).toContain('big.txt');
    expect(note.text).toContain(path ?? '');
    expect(note.text).not.toContain('line of text');
    expect(new Uint8Array(await readFile(path ?? ''))).toEqual(data);
  });
});

class Hub implements HarnessCallPort {
  readonly requests: HarnessCallRequest[] = [];
  constructor(private readonly bytes: Uint8Array) {}
  call(request: HarnessCallRequest): Promise<unknown> {
    this.requests.push(request);
    return Promise.resolve({
      name: 'clip.bin',
      mime: 'application/octet-stream',
      bytes: this.bytes.byteLength,
      sha256: createHash('sha256').update(this.bytes).digest('hex'),
      transcript: null,
    });
  }
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

function hubOver(bytes: Uint8Array): {
  readonly hub: HarnessHub;
  readonly calls: Hub;
  readonly fetched: string[];
} {
  const boot = HARNESS_BOOT.parse({
    type: 'harness_boot',
    protocol: 1,
    device_id: randomUUID(),
    generation: randomUUID(),
    runtime_instance: randomUUID(),
    name: 'Test machine',
    hub_url: 'http://hub.test',
    token: 'token',
    home_directory: '/home/test',
    state_directory: '/home/test/state',
    platform: 'linux',
    permission: { sandbox: 'danger-full-access', approval: 'never' },
  });
  const calls = new Hub(bytes);
  const fetched: string[] = [];
  const fetcher: typeof fetch = (input, init) => {
    fetched.push(`${requestUrl(input)} ${new Headers(init?.headers).get('authorization') ?? ''}`);
    return Promise.resolve(new Response(Buffer.from(bytes)));
  };
  return { hub: new HarnessHub(boot, calls, fetcher), calls, fetched };
}

const CLAIM = DSH_WRITER_CLAIM.parse({
  session_id: 'session-1',
  target: { kind: 'device', device_id: randomUUID() },
  runtime_instance: randomUUID(),
  connection_generation: randomUUID(),
  epoch: 1,
});
const persistence = { claim: (): typeof CLAIM => CLAIM };

async function collected(
  source: AsyncIterable<{ readonly data: Uint8Array }>,
): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for await (const file of source) out.push(file.data);
  return out;
}

describe('an attachment fetched from the hub', () => {
  it('arrives as raw bytes beside its description, however large', async () => {
    const bytes = new Uint8Array(3 * 1024 * 1024).fill(7);
    const { hub, calls, fetched } = hubOver(bytes);
    const id = randomUUID();

    const data = Buffer.concat(
      await collected(transferAttachments(hub, persistence, 'session-1', [id])),
    );

    expect(data.equals(bytes)).toBe(true);
    expect(calls.requests).toEqual([{ operation: 'attachment', claim: CLAIM, attachment_id: id }]);
    expect(fetched).toEqual([
      `http://hub.test/api/ai/harness/sessions/session-1/attachments/${id} Bearer token`,
    ]);
  });
});
