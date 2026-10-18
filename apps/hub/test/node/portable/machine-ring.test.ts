import { describe, expect, it } from 'vitest';
import { MachineRing, type RingSound } from '../../../src/node/controls/machine-ring';

function rig(failToRing = false): {
  readonly ring: MachineRing;
  readonly log: string[];
  readonly ended: (() => void)[];
} {
  const log: string[] = [];
  const ended: (() => void)[] = [];
  const ring = new MachineRing(
    {
      ring: (on, done): Promise<void> => {
        log.push(`ring ${String(on)}`);
        if (failToRing && on) return Promise.reject(new Error('app gone'));
        if (on) ended.push(done);
        return Promise.resolve();
      },
    },
    {
      current: (): Promise<RingSound> => {
        log.push('current');
        return Promise.resolve({ volume: 30, muted: true });
      },
      raise: (): Promise<void> => {
        log.push('raise');
        return Promise.resolve();
      },
      restore: (sound): Promise<void> => {
        log.push(`restore ${String(sound.volume)} ${String(sound.muted)}`);
        return Promise.resolve();
      },
    },
  );
  return { ring, log, ended };
}

describe('ringing a computer', () => {
  it('remembers the sound, raises it, rings and puts the sound back when told to stop', async () => {
    const { ring, log } = rig();
    await ring.set(true);
    await ring.set(false);
    expect(log).toStrictEqual(['current', 'raise', 'ring true', 'ring false', 'restore 30 true']);
  });

  it('puts the sound back when the person stops the ring in the app', async () => {
    const { ring, log, ended } = rig();
    await ring.set(true);
    ended[0]?.();
    await new Promise((resolve) => setImmediate(resolve));
    expect(log.at(-1)).toBe('restore 30 true');
  });

  it('keeps the first remembered sound when asked to ring twice', async () => {
    const { ring, log } = rig();
    await ring.set(true);
    await ring.set(true);
    expect(log.filter((entry) => entry === 'current')).toHaveLength(1);
  });

  it('restores the sound and fails when the app cannot ring', async () => {
    const { ring, log } = rig(true);
    await expect(ring.set(true)).rejects.toThrow('app gone');
    expect(log.at(-1)).toBe('restore 30 true');
  });

  it('does nothing to the sound when stopped without a ring', async () => {
    const { ring, log } = rig();
    await ring.set(false);
    expect(log).toStrictEqual(['ring false']);
  });
});
