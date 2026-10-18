import { describe, expect, it } from 'vitest';
import type { FirewallSystem } from '../../src/firewall/system';
import { lowPortsOf } from '../../src/firewall/low-ports';
import { fakeSystem } from './fake-system';

const FILE = '/proc/sys/net/ipv4/ip_unprivileged_port_start';

function system(start: string | undefined, platform: 'linux' | 'darwin' = 'linux'): FirewallSystem {
  return {
    ...fakeSystem({ files: start === undefined ? {} : { [FILE]: start } }),
    platform,
  };
}

describe('lowPortsOf', () => {
  it('has nothing to say when every port is unprivileged', async () => {
    expect(await lowPortsOf(system('1024\n'), [8555, 8080])).toBeNull();
    expect(await lowPortsOf(system('1024\n'), [])).toBeNull();
  });

  it('has nothing to say outside Linux', async () => {
    expect(await lowPortsOf(system('1024\n', 'darwin'), [443])).toBeNull();
  });

  it('is open when the kernel already lets unprivileged programs bind the lowest port', async () => {
    expect(await lowPortsOf(system('80\n'), [443, 80, 8555])).toEqual({
      start: 80,
      state: 'open',
    });
    expect(await lowPortsOf(system('0'), [443])).toEqual({ start: 443, state: 'open' });
  });

  it('is missing when the kernel still reserves the lowest port', async () => {
    expect(await lowPortsOf(system('1024\n'), [443, 80])).toEqual({ start: 80, state: 'missing' });
    expect(await lowPortsOf(system('81'), [80])).toEqual({ start: 80, state: 'missing' });
  });

  it('is unknown when the setting cannot be read or is not a number', async () => {
    expect(await lowPortsOf(system(undefined), [80])).toEqual({ start: 80, state: 'unknown' });
    expect(await lowPortsOf(system('lots'), [80])).toEqual({ start: 80, state: 'unknown' });
    expect(await lowPortsOf(system('-1'), [80])).toEqual({ start: 80, state: 'unknown' });
  });
});
