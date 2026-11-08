import { MODEL_SPEC, specSignalProblems } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { identityScore } from '@smarteverything/domain';
import { admitEntry } from '../../../src/models/contributions';
import { wizPlugin } from '../../../src/plugins/builtin/wiz';
import { WIZ_A60_COLOUR_MODEL, WIZ_MODELS } from '../../../src/plugins/builtin/wiz/models';

function linearOut(id: string): readonly [number, number] {
  const found = WIZ_A60_COLOUR_MODEL.channels?.find((entry) => entry.id === id);
  if (found?.map.type !== 'linear') throw new Error(`${id} is not a linear channel`);
  return found.map.out;
}

describe('the WiZ A60 colour bulb model', () => {
  it('parses strictly and uses only known signals', () => {
    expect(WIZ_MODELS).toStrictEqual([WIZ_A60_COLOUR_MODEL]);
    expect(MODEL_SPEC.safeParse(WIZ_A60_COLOUR_MODEL).success).toBe(true);
    expect(specSignalProblems(WIZ_A60_COLOUR_MODEL)).toStrictEqual([]);
  });

  it('ties dome glow and halo light to the brightness like the flat light', () => {
    expect(linearOut('lightLevel')).toStrictEqual([0.35, 1]);
    const [dim, full] = linearOut('glow');

    expect(full / dim).toBeGreaterThan(10);

    const level = (brightness: number): number => dim + (full - dim) * brightness;

    expect(level(0.8) / level(0.1)).toBeGreaterThan(6);
  });

  it('hides the dome joint inside the neck collar instead of a drawn seam', () => {
    const parts = WIZ_A60_COLOUR_MODEL.parts.map((part) => part.id);
    const dome = WIZ_A60_COLOUR_MODEL.parts.find((part) => part.id === 'dome');
    const lowest = dome?.geometry.type === 'lathe' ? dome.geometry.profile[0] : undefined;

    expect(parts).not.toContain('seam');
    expect(lowest?.[1]).toBeLessThan(0);
  });

  it('switches the dome and the halo light off while offline', () => {
    const offline = (WIZ_A60_COLOUR_MODEL.channels ?? []).filter(
      (entry) => entry.source === 'online',
    );

    expect(offline.map((entry) => entry.target).sort()).toStrictEqual(['dome', 'light']);
  });

  it('is contributed by the WiZ plugin and admitted for the bulbs it matches', () => {
    const entries = wizPlugin.models ?? [];
    expect(entries.map((entry) => entry.id)).toStrictEqual([WIZ_A60_COLOUR_MODEL.id]);
    const [entry] = entries;
    if (entry === undefined) throw new Error('no WiZ model entry');
    const admission = admitEntry('plugin:wiz', entry);
    expect('admitted' in admission).toBe(true);
    const subject = { brand: 'WiZ', model: 'ESP25_SHRGB_01', family: 'light' } as const;
    expect(identityScore(entry.match, subject)?.tier).toBe('exact');
    expect(entry.brands).toStrictEqual(['WiZ']);
  });
});
