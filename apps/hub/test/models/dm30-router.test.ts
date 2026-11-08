import { MODEL_SPEC, identityScore, specSignalProblems } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { admitEntry } from '../../src/models/contributions';
import { routerPlugin } from '../../src/plugins/builtin/router';
import { ASUS_GT_AXE16000_MODEL as ROUTER } from '../../src/plugins/builtin/router/models';

describe('the ASUS ROG Rapture GT-AXE16000 model', () => {
  it('parses strictly and uses only known signals', () => {
    expect(MODEL_SPEC.safeParse(ROUTER).success).toBe(true);
    expect(specSignalProblems(ROUTER)).toStrictEqual([]);
  });

  it('keeps at most three material slots plus the accent', () => {
    const slots = Object.keys(ROUTER.materials).filter((slot) => slot !== 'accent');

    expect(slots.length).toBeLessThanOrEqual(3);
  });

  it('keeps the published 354 by 354 by 193 mm size and eight antennas', () => {
    expect(ROUTER.footprint).toStrictEqual({ width: 0.354, depth: 0.354, height: 0.193 });
    expect(ROUTER.parts.filter((part) => part.id.startsWith('antenna'))).toHaveLength(8);
  });

  it('draws the body at the published 264 by 74 mm', () => {
    const shell = ROUTER.parts.find((part) => part.id === 'shell')?.geometry;
    if (shell?.type !== 'roundedBox') throw new Error('the shell is not a box');

    expect(shell.width).toBe(0.264);
    expect(shell.depth).toBe(0.264);
    expect(Number(shell.height) + 0.008).toBeCloseTo(0.074, 4);
  });

  it('pulses the lights only with reported traffic and stays still otherwise', () => {
    const shot = ROUTER.shots?.[0];
    const pulses = (ROUTER.channels ?? []).filter((channel) => channel.motion.type === 'pulse');

    expect(shot?.when.anyOf[0]?.allOf.map((leaf) => leaf.signal)).toStrictEqual([
      'online',
      'level',
    ]);
    expect(pulses.map((channel) => channel.source).sort()).toStrictEqual(['fault', 'level']);
    expect(ROUTER.states?.['off']).toStrictEqual({ online: false });
  });

  it('is contributed by the router plugin and admitted for the router it matches', () => {
    const entries = routerPlugin.models ?? [];
    expect(entries.map((entry) => entry.id)).toStrictEqual([ROUTER.id]);
    const [entry] = entries;
    if (entry === undefined) throw new Error('no router model entry');

    expect('admitted' in admitEntry('plugin:router', entry)).toBe(true);

    const subject = { brand: 'ASUS', model: 'GT-AXE16000', family: 'router' } as const;

    expect(identityScore(entry.match, subject)?.tier).toBe('exact');
    expect(entry.brands).toStrictEqual(['ASUS']);
  });
});
