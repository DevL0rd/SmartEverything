import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DSH_SESSION_ID, type HubHarnessControl } from '@smarteverything/domain';
import { HarnessResidence, RECONNECT_GRACE_MS } from '../../src/server/harness-residence';
import { useRig, type Rig } from '../assistant/harness/support/rig';

let rig: Rig;
useRig((made) => {
  rig = made;
});

afterEach(() => {
  vi.useRealTimers();
});

function link(token: string | null = 'token'): {
  readonly token: string | null;
  readonly sent: HubHarnessControl[];
  readonly send: (frame: HubHarnessControl) => void;
  readonly terminate: () => void;
} {
  const sent: HubHarnessControl[] = [];
  return {
    token,
    sent,
    send: (frame): void => {
      sent.push(frame);
    },
    terminate: vi.fn(),
  };
}

function residence(gone: () => void = vi.fn()): HarnessResidence {
  return new HarnessResidence(
    rig.service,
    { device_id: randomUUID(), generation: randomUUID(), runtime_instance: randomUUID() },
    { authenticate: vi.fn() },
    gone,
  );
}

const INTERRUPT = {
  kind: 'interrupt',
  session_id: DSH_SESSION_ID.parse('session-1'),
  expected_epoch: 1,
} as const;

describe('a computer runtime that outlives its socket', () => {
  it('stays alive when the socket drops and the computer reconnects within the grace', async () => {
    vi.useFakeTimers();
    const gone = vi.fn();
    const subject = residence(gone);
    const first = link();
    subject.attach(first);
    subject.detach(first);
    expect(subject.attached).toBe(false);

    await vi.advanceTimersByTimeAsync(RECONNECT_GRACE_MS - 1);
    const second = link();
    subject.attach(second);
    await vi.advanceTimersByTimeAsync(RECONNECT_GRACE_MS * 2);

    expect(gone).not.toHaveBeenCalled();
    expect(subject.attached).toBe(true);
  });

  it('ends once the grace passes without a reconnect and tells its owner', async () => {
    vi.useFakeTimers();
    const gone = vi.fn();
    const subject = residence(gone);
    const only = link();
    subject.attach(only);
    subject.detach(only);

    await vi.advanceTimersByTimeAsync(RECONNECT_GRACE_MS);

    expect(gone).toHaveBeenCalledTimes(1);
    expect(() => {
      subject.attach(link());
    }).toThrow('already ended');
  });

  it('ignores the late close of a socket that was already replaced', async () => {
    vi.useFakeTimers();
    const gone = vi.fn();
    const subject = residence(gone);
    const old = link();
    const replacement = link();
    subject.attach(old);
    subject.attach(replacement);
    subject.detach(old);

    await vi.advanceTimersByTimeAsync(RECONNECT_GRACE_MS * 2);

    expect(gone).not.toHaveBeenCalled();
    expect(subject.attached).toBe(true);
  });

  it('holds an operation sent while reconnecting and admits it once a socket is back', async () => {
    const subject = residence();
    const first = link();
    subject.attach(first);
    subject.detach(first);

    let failure: unknown = null;
    let settled = false;
    const outcome = subject
      .execute(randomUUID(), INTERRUPT)
      .catch((cause: unknown) => {
        failure = cause;
      })
      .finally(() => {
        settled = true;
      });
    await Promise.resolve();
    expect(settled).toBe(false);

    subject.attach(link());
    await outcome;
    expect(failure).toBeInstanceOf(Error);
    expect(failure instanceof Error ? failure.message : '').not.toContain('did not reconnect');
  });

  it('fails a held operation when the computer never comes back', async () => {
    vi.useFakeTimers();
    const subject = residence();
    const only = link();
    subject.attach(only);
    subject.detach(only);
    const outcome = subject.execute(randomUUID(), INTERRUPT);
    const rejected = expect(outcome).rejects.toThrow('did not reconnect');

    await vi.advanceTimersByTimeAsync(RECONNECT_GRACE_MS);

    await rejected;
  });

  it('refuses to send a control frame while no socket is attached', () => {
    const subject = residence();
    const only = link();
    subject.attach(only);
    subject.detach(only);

    expect(() => {
      subject.send({
        ...subject.binding,
        type: 'harness_configuration',
        configuration: { revision: 'initial', entries: [] },
      });
    }).toThrow('reconnecting');
  });
});
