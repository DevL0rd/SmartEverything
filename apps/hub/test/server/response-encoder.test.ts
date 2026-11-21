import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { API_ENDPOINTS, NO_BODY, endpoint } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkedResponse } from '../../src/server/responses/check';
import { CodecWorkerError } from '../../src/codec/thread';
import { ResponseEncoder } from '../../src/server/responses/encoder';
import { captureLogs, testLogger } from '../support/logs';
import { bundledCodecWorker } from '../support/codec-worker';
import { temporaryDirectory } from '../support/server';

let directory: { path: string; remove: () => Promise<void> };
let encoder: ResponseEncoder;

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  encoder = new ResponseEncoder(await bundledCodecWorker(directory.path), testLogger('responses'));
});

afterEach(async () => {
  await encoder.close();
  await directory.remove();
});

describe('the response worker', () => {
  it('checks a response off the main thread and hands back the text to send', async () => {
    await expect(
      encoder.encode(API_ENDPOINTS.removeClient, JSON.stringify({ ok: true }), false),
    ).resolves.toStrictEqual({ valid: true, text: '{"ok":true}' });
  });

  it('names the issues of a response the endpoint does not describe', async () => {
    await expect(
      encoder.encode(API_ENDPOINTS.removeClient, JSON.stringify({ ok: false }), false),
    ).resolves.toStrictEqual({ valid: false, issueCodes: ['invalid_value'] });
  });

  it('refuses an endpoint that is not one of the shared API endpoints', async () => {
    const other = endpoint({
      method: 'GET',
      path: '/api/test/other',
      access: 'owner',
      summary: 'Not shared',
      params: z.strictObject({}),
      query: z.strictObject({}),
      body: NO_BODY,
      response: z.strictObject({ ok: z.literal(true) }),
    });
    await expect(encoder.encode(other, '{"ok":true}', false)).rejects.toBeInstanceOf(
      CodecWorkerError,
    );
  });

  it('answers many responses at once, each with its own text', async () => {
    const answers = await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        encoder.encode(API_ENDPOINTS.removeClient, JSON.stringify({ ok: index >= 0 }), false),
      ),
    );
    expect(answers.every((answer) => answer.valid && answer.text === '{"ok":true}')).toBe(true);
  });

  it('fails the waiting responses when the worker dies and starts a new one for the next', async () => {
    const dying = join(directory.path, 'dying-worker.mjs');
    await writeFile(dying, 'process.exit(3);\n');
    const broken = new ResponseEncoder(dying, testLogger('responses'));
    await expect(broken.encode(API_ENDPOINTS.removeClient, '{"ok":true}', false)).rejects.toThrow(
      'The response worker stopped with code 3.',
    );
    await expect(broken.encode(API_ENDPOINTS.removeClient, '{"ok":true}', false)).rejects.toThrow(
      'The response worker stopped with code 3.',
    );
    await broken.close();
  });

  it('refuses work once it is closed', async () => {
    await encoder.close();
    await expect(
      encoder.encode(API_ENDPOINTS.removeClient, '{"ok":true}', false),
    ).rejects.toBeInstanceOf(CodecWorkerError);
  });
});

describe('the request body check', () => {
  const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

  it('parses and checks a body off the main thread and hands back the value', async () => {
    await expect(
      encoder.decodeBody(API_ENDPOINTS.createRoom, bytes('{"name":"Lamp"}')),
    ).resolves.toStrictEqual({ kind: 'body', value: { name: 'Lamp', position: 0 } });
  });

  it('says when the body is not JSON', async () => {
    await expect(
      encoder.decodeBody(API_ENDPOINTS.createRoom, bytes('{"name":')),
    ).resolves.toStrictEqual({ kind: 'not_json' });
  });

  it('names the issues of a body the endpoint does not accept', async () => {
    const decoded = await encoder.decodeBody(API_ENDPOINTS.createRoom, bytes('{"name":3}'));
    expect(decoded.kind).toBe('invalid');
    expect(decoded.kind === 'invalid' ? decoded.detail : '').toMatch(/^name: /u);
  });
});

describe('the inference body check', () => {
  const bytes = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
  const id = '00000000-0000-4000-8000-000000000001';

  it('parses and checks an inference body off the main thread and hands back the value', async () => {
    const claim = {
      session_id: id,
      target: { kind: 'server' },
      runtime_instance: id,
      connection_generation: id,
      epoch: 1,
    };
    const value = {
      device_id: id,
      generation: id,
      runtime_instance: id,
      claim,
      route_id: id,
      request: { model: 'm', stream: true, messages: [{ role: 'user', content: 'hi' }] },
    };
    await expect(encoder.decodeInference(bytes(value))).resolves.toStrictEqual({
      kind: 'body',
      value,
    });
  });

  it('says when an inference body is not JSON', async () => {
    await expect(
      encoder.decodeInference(new TextEncoder().encode('{"device_id":')),
    ).resolves.toStrictEqual({ kind: 'not_json' });
  });

  it('names the issues of an inference body the schema does not accept', async () => {
    const decoded = await encoder.decodeInference(
      bytes({ device_id: id, generation: id, runtime_instance: id, route_id: id }),
    );
    expect(decoded.kind).toBe('invalid');
    expect(decoded.kind === 'invalid' ? decoded.detail : '').toMatch(/claim/u);
  });
});

describe('a response check', () => {
  it('hides engine tool settings from a member after the response is checked', () => {
    const shaped = endpoint({
      method: 'GET',
      path: '/api/test/engine',
      access: 'member',
      summary: 'An engine',
      params: z.strictObject({}),
      query: z.strictObject({}),
      body: NO_BODY,
      response: z.strictObject({
        engine: z.strictObject({ kind: z.string(), settings: z.record(z.string(), z.unknown()) }),
      }),
    });
    const value = { engine: { kind: 'claude', settings: { builtin_tools: ['bash'] } } };
    expect(checkedResponse(shaped, value, true)).toStrictEqual({
      valid: true,
      value: { engine: { kind: 'claude', settings: { builtin_tools: [] } } },
    });
    expect(checkedResponse(shaped, value, false)).toStrictEqual({ valid: true, value });
  });
});
