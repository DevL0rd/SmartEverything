import type { NodeRequest } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { hubAllows } from '../../src/computers/hub-guard';

const HUB = { role: 'hub', hubPid: 4242 } as const;

function service(unit: string, operation: 'stop' | 'start' | 'restart' | 'disable'): NodeRequest {
  return { verb: 'service_set', change: { action: 'service', unit, operation } };
}

describe('hub own-service guard', () => {
  it.each(['stop', 'restart', 'disable'] as const)(
    'refuses %s of the hub units unconfirmed',
    (op) => {
      expect(hubAllows(service('smarteverything.service', op), HUB, false)).toBe(false);
      expect(hubAllows(service('SmartEverything-desktop.service', op), HUB, false)).toBe(false);
    },
  );

  it('lets a confirmed request through', () => {
    expect(hubAllows(service('smarteverything.service', 'stop'), HUB, true)).toBe(true);
  });

  it('keeps every other service control working', () => {
    expect(hubAllows(service('smarteverything.service', 'start'), HUB, false)).toBe(true);
    expect(hubAllows(service('sshd.service', 'restart'), HUB, false)).toBe(true);
    expect(hubAllows(service('smarteverythingelse', 'stop'), HUB, false)).toBe(true);
  });

  it('refuses ending the hub process but not other programs or pausing', () => {
    const kill = (pid: number, signal: 'end' | 'force' | 'continue'): NodeRequest => ({
      verb: 'signal',
      pid,
      signal,
    });
    expect(hubAllows(kill(4242, 'force'), HUB, false)).toBe(false);
    expect(hubAllows(kill(4242, 'end'), HUB, false)).toBe(false);
    expect(hubAllows(kill(4242, 'continue'), HUB, false)).toBe(true);
    expect(hubAllows(kill(7, 'force'), HUB, false)).toBe(true);
  });

  it('does not guard a normal computer', () => {
    expect(
      hubAllows(service('smarteverything.service', 'stop'), { role: 'pc', hubPid: 1 }, false),
    ).toBe(true);
  });
});
