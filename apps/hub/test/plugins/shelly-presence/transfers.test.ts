import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { OperationPorts } from '../../../src/plugins/builtin/shelly-presence/ports';
import { TRANSFER_HANDLERS } from '../../../src/plugins/builtin/shelly-presence/transfers';
import { sensorFixture } from './sensor-fixture';

interface Sent {
  readonly method: string;
  readonly params: Record<string, JsonValue>;
}

function ports(replies: readonly JsonValue[] = []): { ports: OperationPorts; sent: Sent[] } {
  const sent: Sent[] = [];
  const queue = [...replies];
  return {
    sent,
    ports: {
      device: sensorFixture,
      http: (): never => {
        throw new Error('no http');
      },
      call: <T>(method: string, params: JsonValue, schema: z.ZodType<T>): Promise<T> => {
        sent.push({ method, params: z.record(z.string(), JSON_VALUE).catch({}).parse(params) });
        return Promise.resolve(schema.parse(queue.shift() ?? {}));
      },
      refresh: () => Promise.resolve(),
      reconnect: () => Promise.resolve(),
    },
  };
}

describe('Shelly script and certificate transfers', () => {
  it('splits any text at character boundaries into device-sized pieces that join back', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ unit: fc.constantFrom('a', 'é', '中', '😀'), minLength: 1, maxLength: 3000 }),
        async (code) => {
          const { ports: fake, sent } = ports();
          await TRANSFER_HANDLERS.script_put_code(fake, { id: 1, code });
          const pieces = sent.map((call) => z.string().parse(call.params['code']));
          expect(pieces.join('')).toBe(code);
          for (const piece of pieces) expect(Buffer.byteLength(piece)).toBeLessThanOrEqual(1024);
          expect(sent.map((call) => call.params['append'])).toEqual(
            pieces.map((_, index) => index > 0),
          );
        },
      ),
    );
  });

  it('clears a certificate with one call and uploads others to their own method', async () => {
    const cleared = ports();
    await TRANSFER_HANDLERS.certificate_put(cleared.ports, { target: 'user_ca', data: null });
    expect(cleared.sent).toEqual([
      { method: 'Shelly.PutUserCA', params: { data: null, append: false } },
    ]);
    const uploaded = ports();
    await TRANSFER_HANDLERS.certificate_put(uploaded.ports, {
      target: 'tls_client_key',
      data: 'KEY',
    });
    expect(uploaded.sent[0]?.method).toBe('Shelly.PutTLSClientKey');
  });

  it('reads script source page by page and adds the script status', async () => {
    const { ports: fake, sent } = ports([
      { data: 'let a = 1;', left: 6 },
      { data: ' go();', left: 0 },
      { id: 1, running: true },
    ]);
    const result = await TRANSFER_HANDLERS.script_code(fake, { id: 1 });
    expect(result).toEqual({ code: 'let a = 1; go();', status: { id: 1, running: true } });
    expect(sent.map((call) => call.params['offset'])).toEqual([0, 10, undefined]);
  });

  it('stops reading a script whose pages stop growing', async () => {
    const { ports: fake } = ports([{ data: '', left: 5 }]);
    await expect(TRANSFER_HANDLERS.script_code(fake, { id: 1 })).rejects.toThrow('stopped early');
  });
});
