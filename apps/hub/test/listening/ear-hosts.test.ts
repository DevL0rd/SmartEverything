import type { ComputerFeature } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pcmOfBase64 } from '../../src/computers/ear-pcm';
import {
  EarHostLostError,
  EarHosts,
  EarScoreFailedError,
  NoEarHostError,
  type EarHostFrame,
  type HostMove,
} from '../../src/listening/ear-hosts';
import { captureLogs, testLogger } from '../support/logs';
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

describe('a missing ear host', () => {
  it('is warned about once when the service starts without one and once per outage', () => {
    const logs = captureLogs();
    const ears = (): string[] => logs.events().filter((event) => event.startsWith('ears.'));
    const quiet = new EarHosts({ store: opened.store, log: testLogger('listening') });
    quiet.start();
    expect(ears()).toEqual(['ears.host_missing']);
    quiet.join('alpha', CAN, sink().send);
    quiet.leave('alpha');
    quiet.leave('alpha');
    expect(ears()).toEqual([
      'ears.host_missing',
      'ears.host_changed',
      'ears.host_changed',
      'ears.host_missing',
    ]);
    quiet.close();
  });
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

  it('reports a link that drops while sending as a failed send instead of throwing', () => {
    hosts.join('alpha', CAN, () => {
      throw new Error('link closed');
    });
    expect(hosts.sendTo('alpha', { type: 'ears_close', key: 'k' })).toBe(false);
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

describe('scoring speech on the host', () => {
  const pcm = Int16Array.from([1, 2, 3, 4]);
  const request = { keywords: ['a b @one'], threshold: 0.06, pcm };

  function scoreFrame(
    link: ReturnType<typeof sink>,
  ): Extract<EarHostFrame, { type: 'ears_score' }> {
    const frame = link.frames.find((one) => one.type === 'ears_score');
    if (frame?.type !== 'ears_score') throw new Error('no score request was sent');
    return frame;
  }

  it('sends the lines, the threshold and the audio to the host and returns its answer', async () => {
    const link = sink();
    hosts.join('alpha', CAN, link.send);
    const scoring = hosts.score(request);
    const frame = scoreFrame(link);
    expect(frame).toMatchObject({ keywords: ['a b @one'], threshold: 0.06 });
    expect(Array.from(pcmOfBase64(frame.pcm))).toEqual([1, 2, 3, 4]);
    hosts.scored('alpha', frame.id, true);
    await expect(scoring).resolves.toBe(true);
  });

  it('keeps simultaneous requests apart by their ids', async () => {
    const link = sink();
    hosts.join('alpha', CAN, link.send);
    const first = hosts.score(request);
    const second = hosts.score(request);
    const [one, two] = link.frames.filter((frame) => frame.type === 'ears_score');
    if (one?.type !== 'ears_score' || two?.type !== 'ears_score') throw new Error('two requests');
    expect(one.id).not.toBe(two.id);
    hosts.scored('alpha', two.id, false);
    hosts.scored('alpha', one.id, true);
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
  });

  it('refuses at once, naming the cause, when no computer hosts ears', async () => {
    await expect(hosts.score(request)).rejects.toBeInstanceOf(NoEarHostError);
  });

  it('fails the request when the host leaves before it answers', async () => {
    hosts.join('alpha', CAN, sink().send);
    const scoring = hosts.score(request);
    hosts.leave('alpha');
    await expect(scoring).rejects.toBeInstanceOf(EarHostLostError);
  });

  it('rejects with the host’s reason when it reports that it could not score', async () => {
    const link = sink();
    hosts.join('alpha', CAN, link.send);
    const scoring = hosts.score(request);
    const { id } = scoreFrame(link);
    hosts.scoreFailed('alpha', id, 'engine not loaded');
    await expect(scoring).rejects.toMatchObject({
      name: 'EarScoreFailedError',
      computerId: 'alpha',
      reason: 'engine not loaded',
    });
    await expect(scoring).rejects.toBeInstanceOf(EarScoreFailedError);
    hosts.leave('alpha');
  });

  it('ignores a failure that nobody asked for or that came from another computer', async () => {
    const link = sink();
    hosts.join('alpha', CAN, link.send);
    hosts.join('beta', CAN, sink().send);
    const scoring = hosts.score(request);
    const { id } = scoreFrame(link);
    hosts.scoreFailed('beta', id, 'nope');
    hosts.scoreFailed('alpha', 'unknown', 'nope');
    hosts.scored('alpha', id, true);
    await expect(scoring).resolves.toBe(true);
  });

  it('rejects at once when the host link refuses the frame', async () => {
    class Unreachable extends EarHosts {
      override sendTo(): boolean {
        return false;
      }
    }
    const unreachable = new Unreachable({ store: opened.store, log: testLogger('listening') });
    unreachable.join('alpha', CAN, sink().send);
    await expect(unreachable.score(request)).rejects.toBeInstanceOf(EarHostLostError);
  });

  it('rejects at once as a lost host when the link throws while sending', async () => {
    hosts.join('alpha', CAN, () => {
      throw new Error('link closed');
    });
    await expect(hosts.score(request)).rejects.toBeInstanceOf(EarHostLostError);
  });

  it('ignores an answer that nobody asked for or that came from another computer', async () => {
    const link = sink();
    hosts.join('alpha', CAN, link.send);
    hosts.join('beta', CAN, sink().send);
    const scoring = hosts.score(request);
    const { id } = scoreFrame(link);
    hosts.scored('beta', id, false);
    hosts.scored('alpha', 'unknown', false);
    hosts.scored('alpha', id, true);
    await expect(scoring).resolves.toBe(true);
  });
});
