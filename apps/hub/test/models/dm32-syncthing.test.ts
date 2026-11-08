import { MODEL_SPEC, identityScore, specSignalProblems } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { admitEntry } from '../../src/models/contributions';
import { syncthingPlugin } from '../../src/plugins/builtin/syncthing';
import { SYNCTHING_SYNC_MODEL as SYNC } from '../../src/plugins/builtin/syncthing/models';

describe('the Syncthing sync ring model', () => {
  it('parses strictly and uses only known signals', () => {
    expect(MODEL_SPEC.safeParse(SYNC).success).toBe(true);
    expect(specSignalProblems(SYNC)).toStrictEqual([]);
  });

  it('keeps at most three material slots plus the accent', () => {
    const slots = Object.keys(SYNC.materials).filter((slot) => slot !== 'accent');

    expect(slots.length).toBeLessThanOrEqual(3);
  });

  it('turns the two-arrow ring only while syncing, with a loop of whole half turns', () => {
    const turn = SYNC.channels?.find((channel) => channel.id === 'ringTurn');
    const shot = SYNC.shots?.[0];

    expect(turn).toMatchObject({ target: 'spinner', property: 'rotate', source: 'mode' });
    expect(turn?.map).toStrictEqual({ type: 'enum', table: { syncing: 0.25 } });
    expect(shot?.symmetry).toBe(180);
    expect(((shot?.loopS ?? 0) * 0.25 * 360) % 180).toBe(0);
    expect(SYNC.states?.['idle']?.['mode']).toBe('idle');
  });

  it('lights one rim segment per twelfth of the progress', () => {
    const lit = (progress: number): number =>
      (SYNC.channels ?? []).filter(
        (channel) =>
          channel.id.startsWith('dotLit') &&
          channel.map.type === 'linear' &&
          channel.map.in[1] <= progress,
      ).length;

    expect([0, 0.5, 1].map(lit)).toStrictEqual([0, 6, 12]);
  });

  it('is contributed by the Syncthing plugin and matches the versioned model string', () => {
    const entries = syncthingPlugin.models ?? [];
    expect(entries.map((entry) => entry.id)).toStrictEqual([SYNC.id]);
    const [entry] = entries;
    if (entry === undefined) throw new Error('no Syncthing model entry');

    expect('admitted' in admitEntry('plugin:syncthing', entry)).toBe(true);

    const subject = { brand: 'Syncthing', model: 'Syncthing v2.1.6', family: 'file_sync' } as const;

    expect(identityScore(entry.match, subject)?.tier).toBe('prefix');
  });
});
