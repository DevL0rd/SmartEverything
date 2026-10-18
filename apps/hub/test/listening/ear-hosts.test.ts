import type { ComputerFeature } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EarHosts, type EarHostFrame, type HostMove } from '../../src/listening/ear-hosts';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const CAN: readonly ComputerFeature[] = ['cpu', 'ear_host'];
const CANNOT: readonly ComputerFeature[] = ['cpu', 'microphone'];

let opened: TestStore;
let hosts: EarHosts;
let moves: HostMove[];

function computer(name: string): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: `computer-${name}`,
      parentId: null,
      kind: 'computer',
      name,
      model: 'm',
      manufacturer: 'm',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  return row?.id ?? '';
}

function sink(): { readonly frames: EarHostFrame[]; readonly send: (frame: EarHostFrame) => void } {
  const frames: EarHostFrame[] = [];
  return { frames, send: (frame) => frames.push(frame) };
}

beforeEach(async () => {
  opened = await testStore();
  hosts = new EarHosts({ store: opened.store, log: testLogger('listening') });
  hosts.start();
  moves = [];
  hosts.onMove((move) => moves.push(move));
});

afterEach(async () => {
  hosts.close();
  await opened.close();
});

describe('choosing the computer that listens', () => {
  it('has no host while no computer that can listen is online', () => {
    expect(hosts.host()).toBeNull();
    hosts.join('desk', CANNOT, sink().send);
    expect(hosts.host()).toBeNull();
    expect(moves).toEqual([]);
  });

  it('takes the first online computer that can, in a stable order', () => {
    hosts.join('zeta', CAN, sink().send);
    hosts.join('alpha', CAN, sink().send);
    expect(hosts.host()).toBe('alpha');
    expect(moves).toEqual([
      { from: null, to: 'zeta' },
      { from: 'zeta', to: 'alpha' },
    ]);
  });

  it('prefers the computer the owner chose while it is online', () => {
    const chosen = computer('Studio');
    hosts.join('alpha', CAN, sink().send);
    opened.store.settings.setEarHost(chosen);
    expect(hosts.host()).toBe('alpha');
    hosts.join(chosen, CAN, sink().send);
    expect(hosts.host()).toBe(chosen);
    expect(moves.at(-1)).toEqual({ from: 'alpha', to: chosen });
  });

  it('moves to another computer when the chosen one goes offline, and back when it returns', () => {
    const chosen = computer('Studio');
    opened.store.settings.setEarHost(chosen);
    hosts.join(chosen, CAN, sink().send);
    hosts.join('alpha', CAN, sink().send);
    hosts.leave(chosen);
    expect(hosts.host()).toBe('alpha');
    hosts.join(chosen, CAN, sink().send);
    expect(hosts.host()).toBe(chosen);
  });

  it('follows the setting when it changes and when it is cleared', () => {
    const [low = '', high = ''] = [computer('Desk'), computer('Studio')].sort();
    hosts.join(low, CAN, sink().send);
    hosts.join(high, CAN, sink().send);
    expect(hosts.host()).toBe(low);
    opened.store.settings.setEarHost(high);
    expect(hosts.host()).toBe(high);
    opened.store.settings.setEarHost(null);
    expect(hosts.host()).toBe(low);
  });

  it('reads the setting that was saved before the hub started', () => {
    const chosen = computer('Studio');
    opened.store.settings.setEarHost(chosen);
    const later = new EarHosts({ store: opened.store, log: testLogger('listening') });
    later.join(chosen, CAN, sink().send);
    later.join('alpha', CAN, sink().send);
    expect(later.host()).toBe(chosen);
  });

  it('does not move when an unrelated setting changes or the same host says hello again', () => {
    hosts.join('alpha', CAN, sink().send);
    opened.store.settings.updateHome({ home_name: 'Flat' });
    hosts.join('alpha', CAN, sink().send);
    expect(moves).toEqual([{ from: null, to: 'alpha' }]);
  });

  it('forgets a computer that stops advertising the ability', () => {
    hosts.join('alpha', CAN, sink().send);
    hosts.join('alpha', CANNOT, sink().send);
    expect(hosts.host()).toBeNull();
  });

  it('stops listening to the setting once closed', () => {
    const [low = '', high = ''] = [computer('Desk'), computer('Studio')].sort();
    hosts.join(low, CAN, sink().send);
    hosts.join(high, CAN, sink().send);
    hosts.close();
    opened.store.settings.setEarHost(high);
    expect(hosts.host()).toBe(low);
  });
});

describe('talking to a host', () => {
  it('sends a frame to an online host and reports a host that is gone', () => {
    const link = sink();
    hosts.join('alpha', CAN, link.send);
    expect(hosts.sendTo('alpha', { type: 'ears_close', key: 'k' })).toBe(true);
    expect(hosts.sendTo('beta', { type: 'ears_close', key: 'k' })).toBe(false);
    expect(link.frames).toEqual([{ type: 'ears_close', key: 'k' }]);
  });

  it('hands what a node relays to the listeners with the computer it came from', () => {
    const seen: string[] = [];
    const leave = hosts.onRelayed(({ computerId, key, message }) => {
      seen.push(`${computerId}:${key}:${message.kind}`);
    });
    hosts.relayed('alpha', 'cam', { kind: 'near', phrase: 'Sam' });
    leave();
    hosts.relayed('alpha', 'cam', { kind: 'near', phrase: 'Sam' });
    expect(seen).toEqual(['alpha:cam:near']);
  });
});
