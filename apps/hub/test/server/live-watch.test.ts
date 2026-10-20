import {
  SOCKET_BACK_PRESSURE_BYTES,
  type ClientRow,
  type ComputerLiveNotice,
  type PhoneDetailNotice,
  type ProcessesUpdate,
  type ProcessWindow,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { Viewers } from '../../src/metrics/viewers';
import { LiveWatch, type WatchNotice } from '../../src/server/live-watch';
import { testLogger } from '../support/logs';

const PC = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const AT = '2026-10-17T10:00:00.000Z';

const CLIENT: ClientRow = {
  id: 'client-1',
  name: 'Phone',
  platform: 'android',
  kind: 'phone',
  role: 'member',
  built_in: false,
  profile_id: null,
  created_at: AT,
  last_seen_at: null,
};

interface Fake {
  readonly id: number;
  readonly client: ClientRow;
  readonly socket: { bufferedAmount: number };
}

function connection(id: number, client: ClientRow = CLIENT): Fake {
  return { id, client, socket: { bufferedAmount: 0 } };
}

function notice(parts: ComputerLiveNotice['parts'], deviceId = PC): ComputerLiveNotice {
  return { type: 'computer_live', deviceId, at: AT, parts };
}

const WINDOWS = { windows: [] };

function moving(pid: number, cpu: number): ProcessesUpdate['rows'][number] {
  return {
    pid,
    start: 1,
    cpu,
    state: 'sleeping',
    memoryBytes: 1,
    gpu: null,
    diskRate: 0,
    threads: 1,
    descendants: 0,
    own: true,
  };
}
const SYSTEM_PART = notice({ windows: WINDOWS });

function rig(keyframe: ComputerLiveNotice | null = null): {
  readonly watch: LiveWatch<Fake>;
  readonly viewers: Viewers<ProcessWindow>;
  readonly sent: [number, WatchNotice][];
} {
  const viewers = new Viewers<ProcessWindow>();
  const sent: [number, WatchNotice][] = [];
  const watch = new LiveWatch<Fake>({
    send: (to, message): void => {
      sent.push([to.id, message]);
    },
    log: testLogger(),
  });
  watch.attach({
    viewers,
    allowed: (_client, deviceId) => deviceId !== OTHER,
    keyframe: () => keyframe,
  });
  return { watch, viewers, sent };
}

describe('live watch', () => {
  it('leases each demanded topic per connection and releases them when it closes', () => {
    const { watch, viewers } = rig();
    const phone = connection(1);
    const desktop = connection(2);
    watch.receive(phone, { type: 'watch', demands: [{ deviceId: PC, topics: ['cpu'] }] });
    watch.receive(desktop, {
      type: 'watch',
      demands: [{ deviceId: PC, topics: ['cpu', 'memory'] }],
    });
    expect([...viewers.demand(`device:${PC}`).topics].sort()).toEqual(['cpu', 'memory']);
    watch.close(desktop);
    expect([...viewers.demand(`device:${PC}`).topics]).toEqual(['cpu']);
    watch.receive(phone, { type: 'watch', demands: [] });
    expect(viewers.watched(`device:${PC}`)).toBe(false);
  });

  it('refuses computers the person may not see', () => {
    const { watch, viewers } = rig();
    watch.receive(connection(1), {
      type: 'watch',
      demands: [{ deviceId: OTHER, topics: ['cpu'] }],
    });
    expect(viewers.watched(`device:${OTHER}`)).toBe(false);
  });

  it('sends a notice only to connections that demand its parts, cut to those parts', () => {
    const { watch, sent } = rig();
    const phone = connection(1);
    const idle = connection(2);
    watch.receive(phone, { type: 'watch', demands: [{ deviceId: PC, topics: ['windows'] }] });
    watch.receive(idle, { type: 'watch', demands: [{ deviceId: PC, topics: ['cpu'] }] });
    watch.publish(notice({ windows: WINDOWS, displays: undefined }));
    watch.publish(notice({ windows: WINDOWS }, OTHER));
    expect(sent).toEqual([[1, SYSTEM_PART]]);
  });

  it('sends the merged view at once for newly demanded topics only', () => {
    const { watch, sent } = rig(notice({ windows: WINDOWS }));
    const phone = connection(1);
    watch.receive(phone, { type: 'watch', demands: [{ deviceId: PC, topics: ['windows'] }] });
    watch.receive(phone, {
      type: 'watch',
      demands: [{ deviceId: PC, topics: ['windows', 'cpu'] }],
    });
    expect(sent).toEqual([[1, SYSTEM_PART]]);
  });

  it('keeps only the newest notice per computer while the socket is backed up', () => {
    const { watch, sent } = rig();
    const phone = connection(1);
    watch.receive(phone, {
      type: 'watch',
      demands: [{ deviceId: PC, topics: ['windows', 'system'] }],
    });
    phone.socket.bufferedAmount = SOCKET_BACK_PRESSURE_BYTES + 1;
    watch.publish(notice({ windows: { windows: [] } }));
    watch.publish(notice({ windows: WINDOWS }));
    expect(sent).toEqual([]);
    phone.socket.bufferedAmount = 0;
    watch.publish(notice({ windows: WINDOWS }));
    expect(sent).toEqual([[1, SYSTEM_PART]]);
  });

  it('joins the process rows of notices held back so no changed row is lost', () => {
    const { watch, sent } = rig();
    const phone = connection(1);
    watch.receive(phone, {
      type: 'watch',
      demands: [{ deviceId: PC, topics: ['processes'] }],
    });
    phone.socket.bufferedAmount = SOCKET_BACK_PRESSURE_BYTES + 1;
    watch.publish(
      notice({
        processes: {
          total: 3,
          offset: 0,
          order: ['1:1', '2:1', '3:1'],
          rows: [moving(1, 5), moving(2, 6)],
        },
      }),
    );
    watch.publish(
      notice({
        processes: {
          total: 3,
          offset: 0,
          order: ['1:1', '2:1', '3:1'],
          rows: [moving(2, 9), moving(3, 1)],
        },
      }),
    );
    phone.socket.bufferedAmount = 0;
    watch.publish(
      notice({ processes: { total: 3, offset: 0, order: ['3:1', '2:1', '1:1'], rows: [] } }),
    );
    const first = sent[0]?.[1];
    const processes = first?.type === 'computer_live' ? first.parts.processes : undefined;
    expect(processes?.order).toEqual(['3:1', '2:1', '1:1']);
    expect(processes?.rows.map((item) => [item.pid, item.cpu])).toEqual([
      [1, 5],
      [2, 9],
      [3, 1],
    ]);
  });
});

const HANDSET = '33333333-3333-4333-8333-333333333333';
const POWER = {
  level: 62,
  voltageMv: 4100,
  currentMa: null,
  temperatureC: 30,
  health: 'good',
  cycles: null,
  charger: 'none',
  fullAt: null,
  memory: { totalBytes: 1, availableBytes: 1 },
  at: AT,
} as const;

function detail(parts: PhoneDetailNotice['parts'], deviceId = HANDSET): PhoneDetailNotice {
  return { type: 'phone_detail', deviceId, parts };
}

describe('live watch of a phone', () => {
  function phoneRig(keyframe: (client: ClientRow) => PhoneDetailNotice | null = () => null): {
    readonly watch: LiveWatch<Fake>;
    readonly viewers: Viewers<ProcessWindow>;
    readonly sent: [number, WatchNotice][];
  } {
    const made = rig();
    made.watch.attach({
      viewers: made.viewers,
      allowed: (_client, deviceId) => deviceId === HANDSET,
      keyframe: (deviceId, client) => (deviceId === HANDSET ? keyframe(client) : null),
    });
    return made;
  }

  it('sends phone detail only to connections that watch the phone live', () => {
    const { watch, sent } = phoneRig();
    watch.receive(connection(1), {
      type: 'watch',
      demands: [{ deviceId: HANDSET, topics: ['live'] }],
    });
    watch.receive(connection(2), {
      type: 'watch',
      demands: [{ deviceId: HANDSET, topics: ['summary'] }],
    });
    watch.publish(detail({ power: { ...POWER } }));
    expect(sent.map(([to]) => to)).toEqual([1]);
  });

  it('asks for a notice per watcher and sends nothing to one that gets none', () => {
    const { watch, sent } = phoneRig();
    const owner: ClientRow = { ...CLIENT, id: 'client-2', role: 'owner' };
    watch.receive(connection(1), {
      type: 'watch',
      demands: [{ deviceId: HANDSET, topics: ['live'] }],
    });
    watch.receive(connection(2, owner), {
      type: 'watch',
      demands: [{ deviceId: HANDSET, topics: ['live'] }],
    });
    watch.publishEach(HANDSET, (client) =>
      client.role === 'owner' ? null : detail({ power: { ...POWER } }),
    );
    expect(sent.map(([to]) => to)).toEqual([1]);
  });

  it('opens a new live watch with the stored detail for that watcher once', () => {
    const { watch, sent } = phoneRig(() => detail({ power: { ...POWER } }));
    const phone = connection(1);
    watch.receive(phone, { type: 'watch', demands: [{ deviceId: HANDSET, topics: ['live'] }] });
    watch.receive(phone, { type: 'watch', demands: [{ deviceId: HANDSET, topics: ['live'] }] });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.[1]).toMatchObject({ type: 'phone_detail', deviceId: HANDSET });
  });

  it('joins the sections of notices held back while the socket is backed up', () => {
    const { watch, sent } = phoneRig();
    const phone = connection(1);
    watch.receive(phone, { type: 'watch', demands: [{ deviceId: HANDSET, topics: ['live'] }] });
    phone.socket.bufferedAmount = SOCKET_BACK_PRESSURE_BYTES + 1;
    watch.publish(detail({ power: { ...POWER, level: 60 } }));
    watch.publish(detail({ alarm: { nextAt: null, appLabel: null, at: AT } }));
    expect(sent).toEqual([]);
    phone.socket.bufferedAmount = 0;
    watch.publish(detail({ power: { ...POWER, level: 58 } }));
    const only = sent[0]?.[1];
    expect(only?.type === 'phone_detail' ? Object.keys(only.parts).sort() : []).toEqual([
      'alarm',
      'power',
    ]);
    expect(only?.type === 'phone_detail' ? only.parts.power?.level : 0).toBe(58);
  });

  it('keeps leasing through the computer source after another source is added and stops when it is detached', () => {
    const made = rig();
    const detach = made.watch.attach({
      viewers: made.viewers,
      allowed: () => false,
      keyframe: () => null,
    });
    const phone = connection(1);
    made.watch.receive(phone, { type: 'watch', demands: [{ deviceId: PC, topics: ['cpu'] }] });
    expect(made.viewers.watched(`device:${PC}`)).toBe(true);
    detach();
    made.watch.close(phone);
    expect(made.viewers.watched(`device:${PC}`)).toBe(false);
  });
});
