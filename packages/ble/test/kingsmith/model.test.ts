import { MODEL_SPEC, blurLayerIds, specSignalProblems, stillParts } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { KINGSMITH_G15_MODEL } from '../../src/kingsmith/model';

describe('Kingsmith G15 model', () => {
  it('is a valid spec with a folded param', () => {
    expect(MODEL_SPEC.safeParse(KINGSMITH_G15_MODEL).success).toBe(true);
    expect(KINGSMITH_G15_MODEL.params?.['folded']).toMatchObject({ min: 0, max: 1, default: 0 });
  });

  it('folds the mast on its hinge from the param', () => {
    const hinge = KINGSMITH_G15_MODEL.parts.find((part) => part.id === 'hinge');
    expect(hinge?.transform?.rotation?.[0]).toEqual({ param: 'folded', scale: 80 });
    const onHinge = KINGSMITH_G15_MODEL.parts.filter((part) => part.parent === 'hinge');
    expect(onHinge.map((part) => part.id).sort()).toEqual(
      ['console', 'handlebar', 'uprightLeft', 'uprightRight'].sort(),
    );
  });

  it('blurs the belt from 8 km/h and keeps the blur layer out of stills', () => {
    const scroll = KINGSMITH_G15_MODEL.channels?.find((channel) => channel.id === 'beltScroll');
    expect(scroll?.blur?.part).toBe('beltBlur');
    expect(scroll?.blur?.from).toBeCloseTo((8 / 3.6) * (6 / 1.28));
    expect(blurLayerIds(KINGSMITH_G15_MODEL).has('beltBlur')).toBe(true);
    const still = stillParts(KINGSMITH_G15_MODEL, 1, { folded: 0 }).map((part) => part.id);
    expect(still).toContain('belt');
    expect(still).not.toContain('beltBlur');
  });

  it('tilts the deck by the real incline angle and anchors the console readout', () => {
    expect(specSignalProblems(KINGSMITH_G15_MODEL)).toEqual([]);
    const incline = KINGSMITH_G15_MODEL.channels?.find((channel) => channel.id === 'incline');
    expect(incline?.map).toMatchObject({ type: 'linear', in: [0, 11.31], out: [0, 11.31] });
    const readout = KINGSMITH_G15_MODEL.anchors?.find((anchor) => anchor.id === 'readout');
    expect(readout).toMatchObject({ kind: 'label', parent: 'console' });
  });

  it('frames the hero on the handlebar assembly so the console is not cut', () => {
    expect(KINGSMITH_G15_MODEL.framing.hero.focus).toBe('hinge');
    expect(KINGSMITH_G15_MODEL.parts.find((part) => part.id === 'hinge')).toBeDefined();
  });
});
