import type { ComputerFeature, RemoteEarNodeMessage } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { EarsRelay } from '../../src/computers/ears-relay';
import type { EarHostSend, SessionEarHosts } from '../../src/listening/ear-hosts';

describe('the ears relay as a path to the ear hosts', () => {
  it('does nothing before the hosts are bound', () => {
    const relay = new EarsRelay();
    expect(() => {
      relay.join('desk', ['ear_host'], () => undefined);
      relay.relayed('desk', 'cam', { kind: 'near', phrase: 'Sam' });
      relay.leave('desk');
    }).not.toThrow();
  });

  it('passes joins, relayed messages and leaves to the bound hosts', () => {
    const seen: string[] = [];
    const hosts: SessionEarHosts = {
      join: (
        computerId: string,
        features: readonly ComputerFeature[],
        _send: EarHostSend,
      ): void => {
        seen.push(`join ${computerId} ${features.join(',')}`);
      },
      leave: (computerId: string): void => {
        seen.push(`leave ${computerId}`);
      },
      relayed: (computerId: string, key: string, message: RemoteEarNodeMessage): void => {
        seen.push(`relayed ${computerId} ${key} ${message.kind}`);
      },
    };
    const relay = new EarsRelay();
    relay.bindHosts(hosts);
    relay.join('desk', ['cpu', 'ear_host'], () => undefined);
    relay.relayed('desk', 'cam', { kind: 'near', phrase: 'Sam' });
    relay.leave('desk');
    expect(seen).toEqual(['join desk cpu,ear_host', 'relayed desk cam near', 'leave desk']);
  });
});
