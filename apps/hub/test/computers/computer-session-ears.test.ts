import {
  DEFAULT_COMPUTER_SCOPES,
  DEFAULT_HISTORY_POLICY,
  type AdapterSink,
  type ComputerFeature,
  type HubFrame,
  type NodeHello,
  type ProcessWindow,
  type RemoteEarNodeMessage,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { ComputerDirectory } from '../../src/computers/computer-directory';
import { ComputerSession } from '../../src/computers/computer-session';
import type { EarHostSend, SessionEarHosts } from '../../src/listening/ear-hosts';
import { Viewers } from '../../src/metrics/viewers';
import type { HubLink } from '../../src/node/link';
import { captureLogs, testLogger } from '../support/logs';

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
  features: ['cpu'],
  role: 'pc',
  actions: [],
  permissions: [],
};

interface Joined {
  readonly computerId: string;
  readonly features: readonly ComputerFeature[];
  readonly send: EarHostSend;
}

interface Rig {
  readonly joined: Joined[];
  readonly left: string[];
  readonly relayed: { computerId: string; key: string; message: RemoteEarNodeMessage }[];
  readonly scored: { computerId: string; id: string; heard: boolean }[];
  readonly scoreFailed: { computerId: string; id: string; reason: string }[];
  readonly sent: HubFrame[];
  readonly session: ComputerSession;
  readonly receive: (frame: unknown) => void;
}

function rig(): Rig {
  const joined: Joined[] = [];
  const left: string[] = [];
  const relayed: Rig['relayed'] = [];
  const scored: Rig['scored'] = [];
  const scoreFailed: Rig['scoreFailed'] = [];
  const sent: HubFrame[] = [];
  const listeners = new Set<(frame: unknown) => void>();
  const link: HubLink = {
    send: (frame): void => {
      sent.push(frame);
    },
    onFrame: (listener): (() => void) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
  const sink: AdapterSink = {
    state: () => undefined,
    event: () => undefined,
    devices: () => undefined,
    failure: () => undefined,
    online: () => undefined,
  };
  const earHosts: SessionEarHosts = {
    join: (computerId, features, send): void => {
      joined.push({ computerId, features, send });
    },
    leave: (computerId): void => {
      left.push(computerId);
    },
    relayed: (computerId, key, message): void => {
      relayed.push({ computerId, key, message });
    },
    scored: (computerId, id, heard): void => {
      scored.push({ computerId, id, heard });
    },
    scoreFailed: (computerId, id, reason): void => {
      scoreFailed.push({ computerId, id, reason });
    },
  };
  const session = new ComputerSession({
    link,
    sink,
    history: { push: (): void => undefined },
    viewers: new Viewers<ProcessWindow>(),
    policyOf: (): typeof DEFAULT_HISTORY_POLICY => DEFAULT_HISTORY_POLICY,
    publish: (): void => undefined,
    deviceIdOf: (): string => 'device-1',
    scopesOf: (): typeof DEFAULT_COMPUTER_SCOPES => DEFAULT_COMPUTER_SCOPES,
    directory: new ComputerDirectory(null),
    hubComputerResolved: (): void => undefined,
    earHosts,
    recordAppTime: (): void => undefined,
    signals: { emit: (): void => undefined },
    personOf: (): null => null,
    now: (): Date => new Date('2026-10-08T10:00:00.000Z'),
    log: testLogger(),
  });
  const receive = (frame: unknown): void => {
    listeners.forEach((listener) => {
      listener(frame);
    });
  };
  return { joined, left, relayed, scored, scoreFailed, sent, session, receive };
}

beforeEach(() => {
  captureLogs();
});

describe('a computer session as an ear host', () => {
  it('offers the computer with the features it announced, and sends frames down its link', () => {
    const { joined, receive, sent } = rig();
    receive({ type: 'hello', hello: { ...HELLO, features: ['cpu', 'ear_host'] } });
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatchObject({ computerId: 'device-1', features: ['cpu', 'ear_host'] });
    joined[0]?.send({ type: 'ears_close', key: 'cam' });
    expect(sent).toContainEqual({ type: 'ears_close', key: 'cam' });
  });

  it('hands a relayed ear message to the hosts under the computer’s device', () => {
    const { relayed, receive } = rig();
    receive({ type: 'hello', hello: { ...HELLO, features: ['ear_host'] } });
    receive({ type: 'ears', key: 'cam', ear: { kind: 'near', phrase: 'Sam' } });
    expect(relayed).toEqual([
      { computerId: 'device-1', key: 'cam', message: { kind: 'near', phrase: 'Sam' } },
    ]);
  });

  it('hands a score answer to the hosts under the computer’s device', () => {
    const { scored, receive } = rig();
    receive({ type: 'hello', hello: { ...HELLO, features: ['ear_host'] } });
    receive({ type: 'ears_scored', id: 'one', heard: true });
    expect(scored).toEqual([{ computerId: 'device-1', id: 'one', heard: true }]);
  });

  it('hands a score failure to the hosts under the computer’s device', () => {
    const { scoreFailed, receive } = rig();
    receive({ type: 'hello', hello: { ...HELLO, features: ['ear_host'] } });
    receive({ type: 'ears_score_failed', id: 'one', reason: 'engine not loaded' });
    expect(scoreFailed).toEqual([
      { computerId: 'device-1', id: 'one', reason: 'engine not loaded' },
    ]);
  });

  it('drops a relayed message that breaks the contract', () => {
    const { relayed, receive } = rig();
    receive({ type: 'hello', hello: { ...HELLO, features: ['ear_host'] } });
    receive({ type: 'ears', key: '', ear: { kind: 'near', phrase: 'Sam' } });
    receive({ type: 'ears', key: 'cam', ear: { kind: 'level', dbfs: -20 } });
    expect(relayed).toEqual([]);
  });

  it('takes the computer away from the hosts when the session stops', () => {
    const { left, receive, session } = rig();
    receive({ type: 'hello', hello: { ...HELLO, features: ['ear_host'] } });
    session.stop();
    expect(left).toEqual(['device-1']);
  });

  it('has nothing to tell the hosts about a computer that never said hello', () => {
    const { left, relayed, receive, session } = rig();
    receive({ type: 'ears', key: 'cam', ear: { kind: 'near', phrase: 'Sam' } });
    session.stop();
    expect(relayed).toEqual([]);
    expect(left).toEqual([]);
  });
});
