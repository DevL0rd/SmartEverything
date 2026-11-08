import { identityScore } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { admitEntry } from '../../../src/models/contributions';
import { aibiPlugin } from '../../../src/plugins/builtin/aibi';

describe('the aibi plugin models', () => {
  it('contributes an admitted model that resolves for its real device', () => {
    const entries = aibiPlugin.models ?? [];
    expect(entries.map((entry) => entry.id)).toStrictEqual(['dev.robot.aibi-pocket']);
    const [entry] = entries;
    if (entry === undefined) throw new Error('no model entry');
    expect('admitted' in admitEntry('plugin:aibi', entry)).toBe(true);
    const subject = { brand: 'AIBI', model: 'AIBI robot', family: 'robot' } as const;
    expect(identityScore(entry.match, subject)?.tier).toBe('exact');
    expect(entry.brands).toStrictEqual(['AIBI']);
  });
});
