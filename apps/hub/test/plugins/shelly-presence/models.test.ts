import { identityScore } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { admitEntry } from '../../../src/models/contributions';
import { shellyPresencePlugin } from '../../../src/plugins/builtin/shelly-presence';

describe('the shelly-presence plugin models', () => {
  it('contributes an admitted model that resolves for its real device', () => {
    const entries = shellyPresencePlugin.models ?? [];
    expect(entries.map((entry) => entry.id)).toStrictEqual(['dev.sensor.shelly-presence-gen4']);
    const [entry] = entries;
    if (entry === undefined) throw new Error('no model entry');
    expect('admitted' in admitEntry('plugin:shelly-presence', entry)).toBe(true);
    const subject = { brand: 'Shelly', model: 'S4SN-0U61X', family: 'sensor' } as const;
    expect(identityScore(entry.match, subject)?.tier).toBe('exact');
    expect(entry.brands).toStrictEqual(['Shelly']);
  });
});
