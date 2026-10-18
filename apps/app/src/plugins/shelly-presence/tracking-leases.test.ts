import { describe, expect, it } from 'vitest';
import { presenceFixture } from './presence-fixture';
import { liveSupport, TrackingLeases } from './tracking-leases';

const SENSOR = 'shelly-presence:radar-1';

interface Gate {
  readonly resolve: () => void;
  readonly reject: (cause: Error) => void;
}

function rig(options: { readonly failStart?: boolean } = {}): {
  readonly leases: TrackingLeases;
  readonly sent: boolean[];
  readonly failures: string[];
  readonly pending: Gate[];
} {
  const sent: boolean[] = [];
  const failures: string[] = [];
  const pending: Gate[] = [];
  const leases = new TrackingLeases({
    send: (_id, enabled): Promise<void> => {
      sent.push(enabled);
      if (options.failStart === true && enabled) return Promise.reject(new Error('refused'));
      return new Promise<void>((resolve, reject) => {
        pending.push({ resolve, reject });
      });
    },
    describe: (cause): string => (cause instanceof Error ? cause.message : String(cause)),
    onFailure: (kind): void => {
      failures.push(kind);
    },
  });
  return { leases, sent, failures, pending };
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function resolveNext(pending: Gate[]): Promise<void> {
  pending.shift()?.resolve();
  await settle();
}

describe('tracking leases', () => {
  it('holds once for two views, keeps it when the first leaves and releases when the last leaves', async () => {
    const { leases, sent, pending } = rig();
    const first = leases.acquire(SENSOR);
    const second = leases.acquire(SENSOR);
    await resolveNext(pending);
    expect(sent).toStrictEqual([true]);
    expect(leases.read(SENSOR).phase).toBe('held');
    first();
    await settle();
    expect(sent).toStrictEqual([true]);
    second();
    await settle();
    expect(sent).toStrictEqual([true, false]);
    await resolveNext(pending);
    expect(leases.read(SENSOR).phase).toBe('off');
    expect(leases.store.get().size).toBe(0);
  });

  it('ignores a second release from the same view', async () => {
    const { leases, sent, pending } = rig();
    const first = leases.acquire(SENSOR);
    const second = leases.acquire(SENSOR);
    await resolveNext(pending);
    first();
    first();
    await settle();
    expect(leases.read(SENSOR).count).toBe(1);
    expect(sent).toStrictEqual([true]);
    second();
  });

  it('sends nothing when a view leaves before the start settles and returns', async () => {
    const { leases, sent, pending } = rig();
    const gone = leases.acquire(SENSOR);
    gone();
    const back = leases.acquire(SENSOR);
    await resolveNext(pending);
    expect(sent).toStrictEqual([true]);
    expect(leases.read(SENSOR).phase).toBe('held');
    back();
  });

  it('releases a start that finished after the last view left', async () => {
    const { leases, sent, pending } = rig();
    const gone = leases.acquire(SENSOR);
    gone();
    await resolveNext(pending);
    expect(sent).toStrictEqual([true, false]);
    await resolveNext(pending);
    expect(leases.read(SENSOR).phase).toBe('off');
  });

  it('reports one failure and retries only on request', async () => {
    const { leases, sent, failures } = rig({ failStart: true });
    leases.acquire(SENSOR);
    await settle();
    expect(leases.read(SENSOR)).toMatchObject({ phase: 'failed', error: 'refused' });
    expect(failures).toStrictEqual(['start']);
    await settle();
    expect(sent).toStrictEqual([true]);
    leases.retry(SENSOR);
    await settle();
    expect(sent).toStrictEqual([true, true]);
  });

  it('forgets a failed lease when its last view leaves without sending a release', async () => {
    const { leases, sent } = rig({ failStart: true });
    const view = leases.acquire(SENSOR);
    await settle();
    view();
    await settle();
    expect(sent).toStrictEqual([true]);
    expect(leases.store.get().size).toBe(0);
  });

  it('keeps leases of different sensors apart', async () => {
    const { leases, pending } = rig();
    const one = leases.acquire(SENSOR);
    leases.acquire('shelly-presence:radar-2');
    await resolveNext(pending);
    await resolveNext(pending);
    one();
    await settle();
    expect(leases.read('shelly-presence:radar-2').phase).toBe('held');
  });
});

describe('live support', () => {
  it('is ready only for an online sensor that offers live tracking', () => {
    const plain = presenceFixture();
    expect(liveSupport(plain)).toBe('unsupported');
    const live = presenceFixture({ actions: ['live_track'] });
    expect(liveSupport(live)).toBe('ready');
    expect(liveSupport({ ...live, connection: { state: 'offline', reason: null } })).toBe(
      'offline',
    );
  });
});
