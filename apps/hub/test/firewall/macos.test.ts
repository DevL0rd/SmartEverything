import { SOCKETFILTERFW, type PortRule } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { FirewallSystem } from '../../src/firewall/system';
import { probeMac } from '../../src/firewall/macos';
import { fakeSystem } from './fake-system';

const CAMERA: PortRule = { purpose: 'camera', protocol: 'udp', source: '192.168.1.50' };
const WEBRTC: PortRule = { purpose: 'webrtc', protocol: 'tcp', port: 8555 };
const HUB: PortRule = { purpose: 'hub', protocol: 'tcp', port: 8788, source: '192.168.1.0/24' };

function answer(
  args: string,
  stdout: string,
  code = 0,
): Record<string, { code: number; stdout: string }> {
  return { [`${SOCKETFILTERFW} ${args}`]: { code, stdout } };
}

function mac(state: string, go2rtc: string, app: string): FirewallSystem {
  return {
    ...fakeSystem({
      programs: {
        ...answer('--getglobalstate', `Firewall is enabled. (State = ${state})\n`),
        ...answer('--getappblocked /opt/go2rtc', go2rtc),
        ...answer('--getappblocked /opt/app', app),
      },
    }),
    platform: 'darwin' as const,
  };
}

const PERMITTED = 'Application is permitted to receive incoming connections\n';
const BLOCKED = 'Application is blocked from receiving incoming connections\n';
const UNLISTED = 'The application is not part of the firewall\n';

describe('probeMac', () => {
  it('reports an off application firewall as open everywhere with nothing to fix', async () => {
    const probe = await probeMac({
      ...fakeSystem({
        programs: answer('--getglobalstate', 'Firewall is disabled. (State = 0)\n'),
      }),
      platform: 'darwin',
    });
    expect(probe).toMatchObject({ backend: 'macos', filtering: false, draft: null });
    expect(probe.stateOf(WEBRTC)).toBe('open');
  });

  it('judges camera and live video by go2rtc and everything else by the app', async () => {
    const probe = await probeMac(mac('1', PERMITTED, BLOCKED));
    expect(probe.filtering).toBe(true);
    expect(probe.stateOf(CAMERA)).toBe('open');
    expect(probe.stateOf(WEBRTC)).toBe('open');
    expect(probe.stateOf(HUB)).toBe('denied');
  });

  it('maps an unlisted program to missing', async () => {
    const probe = await probeMac(mac('1', UNLISTED, PERMITTED));
    expect(probe.stateOf(CAMERA)).toBe('missing');
    expect(probe.stateOf(HUB)).toBe('open');
  });

  it('drafts a plan for exactly the programs that are not permitted', async () => {
    const both = await probeMac(mac('1', BLOCKED, UNLISTED));
    expect(both.draft?.([])).toEqual({
      backend: 'macos',
      programs: ['/opt/go2rtc', '/opt/app'],
    });
    const one = await probeMac(mac('1', PERMITTED, BLOCKED));
    expect(one.draft?.([])).toEqual({ backend: 'macos', programs: ['/opt/app'] });
    const none = await probeMac(mac('1', PERMITTED, PERMITTED));
    expect(none.draft).toBeNull();
  });

  it('can fix missing, denied and unknown openings', async () => {
    const probe = await probeMac(mac('1', PERMITTED, PERMITTED));
    expect([...probe.fixable].sort()).toEqual(['denied', 'missing', 'unknown']);
  });

  it('says so when the firewall blocks all incoming connections', async () => {
    const probe = await probeMac(mac('2', PERMITTED, PERMITTED));
    expect(probe.detail).toMatch(/blocks all incoming connections/);
  });

  it('refuses an answer it cannot read instead of guessing', async () => {
    await expect(probeMac(mac('1', 'huh?\n', PERMITTED))).rejects.toThrow(
      'socketfilterfw --getappblocked must answer what it allows; received "huh?".',
    );
    await expect(
      probeMac({
        ...fakeSystem({ programs: answer('--getglobalstate', 'no state here') }),
        platform: 'darwin',
      }),
    ).rejects.toThrow('socketfilterfw --getglobalstate must answer');
  });

  it('fails when socketfilterfw is missing or exits with an error', async () => {
    await expect(probeMac({ ...fakeSystem(), platform: 'darwin' })).rejects.toThrow(
      'it is not installed',
    );
    await expect(
      probeMac({
        ...fakeSystem({ programs: answer('--getglobalstate', '', 1) }),
        platform: 'darwin',
      }),
    ).rejects.toThrow('it exited with 1');
  });
});
