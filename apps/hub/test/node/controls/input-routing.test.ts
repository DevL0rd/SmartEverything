import {
  DEFAULT_COMPUTER_SCOPES,
  type ComputerInput,
  type NodeHello,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { inertControls } from './unused-controls';
import { NodeRequestHandler } from '../../../src/node/request-handler';

const HELLO: NodeHello = {
  machineId: '0123456789abcdef0123456789abcdef',
  hostname: 'desk',
  os: { name: 'Linux', kernel: '6.0' },
  hardware: { vendor: null, product: null, portable: false },
  cpu: { model: 'CPU', threads: 2, hybrid: false, kinds: [] },
  memoryBytes: 8e9,
  interfaces: [],
  bootedAt: '2026-10-08T09:00:00.000Z',
  power: [],
  actions: [],
  permissions: [],
  features: [],
  role: 'pc',
};

function rig(): { handler: NodeRequestHandler; sent: ComputerInput[] } {
  const sent: ComputerInput[] = [];
  const controls = {
    ...inertControls(),
    input: {
      features: (): Promise<readonly never[]> => Promise.resolve([]),
      send: (input: ComputerInput): Promise<void> => {
        sent.push(input);
        return Promise.resolve();
      },
    },
  };
  return { handler: new NodeRequestHandler(controls), sent };
}

describe('input requests', () => {
  it('are refused while the input permission is off, which is the default', async () => {
    const { handler, sent } = rig();
    handler.allow(DEFAULT_COMPUTER_SCOPES);
    await expect(
      handler.handle({ verb: 'input', input: { action: 'click', x: 1, y: 2 } }, HELLO),
    ).rejects.toMatchObject({ code: 'scope_off' });
    expect(sent).toEqual([]);
  });

  it('reach the input control once the person turns the permission on', async () => {
    const { handler, sent } = rig();
    handler.allow({ ...DEFAULT_COMPUTER_SCOPES, input: true });
    const result = await handler.handle(
      { verb: 'input', input: { action: 'type', text: 'hello' } },
      HELLO,
    );
    expect(result).toBeNull();
    expect(sent).toEqual([{ action: 'type', text: 'hello' }]);
  });
});
