import { MODEL_SPEC, identityScore, specSignalProblems } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { admitEntry } from '../../src/models/contributions';
import { adguardPlugin } from '../../src/plugins/builtin/adguard';
import { ADGUARD_SHIELD_MODEL as SHIELD } from '../../src/plugins/builtin/adguard/models';

describe('the AdGuard Home shield model', () => {
  it('parses strictly and uses only known signals', () => {
    expect(MODEL_SPEC.safeParse(SHIELD).success).toBe(true);
    expect(specSignalProblems(SHIELD)).toStrictEqual([]);
  });

  it('keeps at most three material slots plus the accent', () => {
    const slots = Object.keys(SHIELD.materials).filter((slot) => slot !== 'accent');

    expect(slots.length).toBeLessThanOrEqual(3);
  });

  it('sweeps the scan bar only while protection is on and sparks only on blocks', () => {
    const sweep = SHIELD.channels?.find((channel) => channel.id === 'scanSweep');
    const spark = SHIELD.channels?.find((channel) => channel.id === 'sparkBlocked');

    expect(sweep).toMatchObject({ source: 'power', property: 'translate', axis: 'x' });
    expect(sweep?.motion.type).toBe('oscillate');
    expect(spark).toMatchObject({ source: 'level', motion: { type: 'pulse' } });
    expect(SHIELD.shots?.[0]?.focus).toBe('face');
    expect(SHIELD.states?.['off']).toStrictEqual({ online: false });
  });

  it('is contributed by the AdGuard plugin and matches the versioned model string', () => {
    const entries = adguardPlugin.models ?? [];
    expect(entries.map((entry) => entry.id)).toStrictEqual([SHIELD.id]);
    const [entry] = entries;
    if (entry === undefined) throw new Error('no AdGuard model entry');

    expect('admitted' in admitEntry('plugin:adguard', entry)).toBe(true);

    const subject = {
      brand: 'AdGuard',
      model: 'AdGuard Home v0.107.78',
      family: 'dns_filter',
    } as const;

    expect(identityScore(entry.match, subject)?.tier).toBe('prefix');
  });
});
