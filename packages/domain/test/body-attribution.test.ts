import { describe, expect, it } from 'vitest';
import { attributeReading, type AttributionCandidate, type WeighIn } from '../src';

function history(...weights: readonly number[]): readonly WeighIn[] {
  return weights.map((weightKg) => ({ weightKg, confirmed: false }));
}

const ALICE: AttributionCandidate = { profileId: 'alice', scaleUser: 1, weighIns: [] };
const SAM: AttributionCandidate = { profileId: 'sam', scaleUser: 2, weighIns: [] };
const NEW: AttributionCandidate = { profileId: 'new', scaleUser: null, weighIns: [] };

describe('who a weigh-in belongs to', () => {
  it('gives it to the owner of the scale slot', () => {
    expect(attributeReading({ scaleUser: 2, weightKg: 70 }, [ALICE, SAM])).toEqual({
      profileId: 'sam',
      attribution: 'scale',
    });
  });

  it('gives it to the only profile when its slot matches or is not linked yet', () => {
    expect(attributeReading({ scaleUser: 1, weightKg: 70 }, [ALICE])).toEqual({
      profileId: 'alice',
      attribution: 'only_profile',
    });
    expect(attributeReading({ scaleUser: 5, weightKg: 70 }, [NEW])).toEqual({
      profileId: 'new',
      attribution: 'only_profile',
    });
    expect(attributeReading({ scaleUser: null, weightKg: 70 }, [ALICE])).toEqual({
      profileId: 'alice',
      attribution: 'only_profile',
    });
  });

  it('gives a weigh-in on another slot to the only profile when it matches their weight', () => {
    const owner = { ...ALICE, scaleUser: 0, weighIns: history(88.8, 88.9, 89.2, 87.8, 89.4) };
    expect(attributeReading({ scaleUser: 1, weightKg: 90.1 }, [owner])).toEqual({
      profileId: 'alice',
      attribution: 'weight',
    });
  });

  it('keeps a weigh-in from another slot away from the only profile when nothing matches', () => {
    expect(attributeReading({ scaleUser: 3, weightKg: 70 }, [ALICE])).toEqual({
      profileId: null,
      attribution: 'pending',
    });
    const owner = { ...ALICE, weighIns: history(88.8, 89.2, 89.4) };
    expect(attributeReading({ scaleUser: 3, weightKg: 64.2 }, [owner])).toEqual({
      profileId: null,
      attribution: 'pending',
    });
  });

  it('picks the one person whose recent weight it matches when the slot belongs to nobody', () => {
    const alice = { ...ALICE, weighIns: history(60, 60.4) };
    const sam = { ...SAM, weighIns: history(90, 89.5) };
    expect(attributeReading({ scaleUser: 0, weightKg: 61 }, [alice, sam])).toEqual({
      profileId: 'alice',
      attribution: 'weight',
    });
  });

  it('gives it to the matching person when the slot owner weighs very differently', () => {
    const alice = { ...ALICE, weighIns: history(60, 60.4) };
    const sam = { ...SAM, weighIns: history(90, 89.5) };
    expect(attributeReading({ scaleUser: 1, weightKg: 89.8 }, [alice, sam])).toEqual({
      profileId: 'sam',
      attribution: 'weight',
    });
  });

  it('leaves it pending when the weight matches several people', () => {
    const alice = { ...ALICE, weighIns: history(70, 70.4) };
    const sam = { ...SAM, weighIns: history(71, 71.5) };
    expect(attributeReading({ scaleUser: 3, weightKg: 70.8 }, [alice, sam])).toEqual({
      profileId: null,
      attribution: 'pending',
    });
  });

  it('leaves it pending when it matches nobody known', () => {
    expect(attributeReading({ scaleUser: 3, weightKg: 70 }, [ALICE, SAM])).toEqual({
      profileId: null,
      attribution: 'pending',
    });
    expect(attributeReading({ scaleUser: null, weightKg: 70 }, [ALICE, NEW])).toEqual({
      profileId: null,
      attribution: 'pending',
    });
  });

  it('holds back a weight far from the slot owner when nobody else matches', () => {
    const owner = { ...ALICE, weighIns: history(88.8, 88.9, 89.2, 87.8, 89.4) };
    expect(attributeReading({ scaleUser: 1, weightKg: 10.1 }, [owner])).toEqual({
      profileId: null,
      attribution: 'pending',
    });
  });

  it('leaves it pending when two people claim the same slot and neither has a history', () => {
    expect(
      attributeReading({ scaleUser: 1, weightKg: 70 }, [ALICE, { ...ALICE, profileId: 'twin' }]),
    ).toEqual({ profileId: null, attribution: 'pending' });
  });

  it('leaves it pending when there are no people', () => {
    expect(attributeReading({ scaleUser: 1, weightKg: 70 }, [])).toEqual({
      profileId: null,
      attribution: 'pending',
    });
  });
});
