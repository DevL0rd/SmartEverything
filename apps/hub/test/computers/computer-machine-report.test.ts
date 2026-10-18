import type { DiscoveredDevice } from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { captureLogs } from '../support/logs';
import { HELLO, sessionRig } from '../support/session-rig';

let described: DiscoveredDevice[];

beforeEach(() => {
  captureLogs();
  described = [];
});

function keys(device: DiscoveredDevice | undefined): string[] {
  return (device?.capabilities ?? []).map((capability) => capability.key);
}

describe('what a computer says it can do (fake link)', () => {
  it('offers only the machine actions the hello reports as usable', () => {
    const { session } = sessionRig('device-1', {
      devices: (devices) => described.push(...devices),
      hello: {
        ...HELLO,
        actions: [
          { action: 'ring', state: 'ready' },
          { action: 'unlock', state: 'unsupported', reason: 'macOS has no way to unlock.' },
          {
            action: 'open',
            state: 'needs_permission',
            permission: 'mac_automation',
            reason: 'Needs permission.',
          },
        ],
      },
    });
    expect(session.machineActions().map((support) => support.action)).toEqual([
      'ring',
      'unlock',
      'open',
    ]);
  });

  it('adds and removes capabilities when the machine reports a change, without a new hello', () => {
    const { deliver } = sessionRig('device-1', {
      devices: (devices) => described.push(...devices),
    });
    deliver({
      type: 'machine',
      actions: [
        { action: 'ring', state: 'ready' },
        { action: 'show_unlock', state: 'ready' },
      ],
      permissions: [],
    });
    expect(keys(described.at(-1))).toEqual(expect.arrayContaining(['ring', 'show_unlock']));
    expect(keys(described.at(-1))).not.toContain('unlock');
    deliver({
      type: 'machine',
      actions: [{ action: 'ring', state: 'ready' }],
      permissions: [{ permission: 'mac_screen_recording', granted: false }],
    });
    expect(keys(described.at(-1))).toContain('ring');
    expect(keys(described.at(-1))).not.toContain('show_unlock');
  });

  it('keeps stop ringing and open out of the list until the machine reports them', () => {
    const { deliver } = sessionRig('device-1', {
      devices: (devices) => described.push(...devices),
    });
    deliver({ type: 'machine', actions: [{ action: 'ring', state: 'ready' }], permissions: [] });
    expect(keys(described.at(-1))).not.toContain('open');
    expect(keys(described.at(-1))).not.toContain('stop_ring');
  });
});
