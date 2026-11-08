import { identityScore } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { admitEntry } from '../../../src/models/contributions';
import { printerPlugin } from '../../../src/plugins/builtin/printer';

describe('the printer plugin models', () => {
  it('contributes an admitted model that resolves for its real device', () => {
    const entries = printerPlugin.models ?? [];
    expect(entries.map((entry) => entry.id)).toStrictEqual(['dev.printer.brother-dcp-t430w']);
    const [entry] = entries;
    if (entry === undefined) throw new Error('no model entry');
    expect('admitted' in admitEntry('plugin:printer', entry)).toBe(true);
    const subject = { brand: 'Brother', model: 'Brother DCP-T430W', family: 'printer' } as const;
    expect(identityScore(entry.match, subject)?.tier).toBe('exact');
    expect(entry.brands).toStrictEqual(['Brother']);
  });
});
