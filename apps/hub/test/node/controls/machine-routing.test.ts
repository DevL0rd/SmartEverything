import { DEFAULT_COMPUTER_SCOPES, type NodeHello } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { ComputerControls } from '../../../src/node/controls/controls';
import { NodeRequestHandler } from '../../../src/node/request-handler';
import { captureLogs } from '../../support/logs';
import { inertControls } from './unused-controls';

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

function handler(seen: string[]): NodeRequestHandler {
  captureLogs();
  const controls: ComputerControls = {
    ...inertControls(),
    machine: {
      ...inertControls().machine,
      ring: (on): Promise<void> => {
        seen.push(`ring ${String(on)}`);
        return Promise.resolve();
      },
      open: (target): Promise<void> => {
        seen.push(`open ${target.kind}`);
        return Promise.resolve();
      },
      unlock: (): Promise<void> => {
        seen.push('unlock');
        return Promise.resolve();
      },
      showUnlock: (): Promise<void> => {
        seen.push('show_unlock');
        return Promise.resolve();
      },
    },
  };
  return new NodeRequestHandler(controls);
}

describe('machine action requests', () => {
  it('reach the machine control with their fields', async () => {
    const seen: string[] = [];
    const node = handler(seen);
    await node.handle({ verb: 'ring', on: true }, HELLO);
    await node.handle({ verb: 'ring', on: false }, HELLO);
    await node.handle({ verb: 'open', target: { kind: 'path', path: '/tmp/a.txt' } }, HELLO);
    await node.handle({ verb: 'unlock' }, HELLO);
    await node.handle({ verb: 'show_unlock' }, HELLO);
    expect(seen).toEqual(['ring true', 'ring false', 'open path', 'unlock', 'show_unlock']);
  });

  it('are refused when the scope that guards them is off', async () => {
    const seen: string[] = [];
    const node = handler(seen);
    node.allow({ ...DEFAULT_COMPUTER_SCOPES, apps: false, power: false });
    await expect(node.handle({ verb: 'ring', on: true }, HELLO)).rejects.toMatchObject({
      code: 'scope_off',
    });
    await expect(
      node.handle({ verb: 'open', target: { kind: 'url', url: 'https://example.com' } }, HELLO),
    ).rejects.toMatchObject({ code: 'scope_off' });
    await expect(node.handle({ verb: 'unlock' }, HELLO)).rejects.toMatchObject({
      code: 'scope_off',
    });
    expect(seen).toEqual([]);
  });
});
