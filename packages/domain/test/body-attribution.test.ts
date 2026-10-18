import { describe, expect, it } from 'vitest';
import { attributeReading } from '../src';

const ALICE = { profileId: 'alice', scaleUser: 1 };
const SAM = { profileId: 'sam', scaleUser: 2 };
const NEW = { profileId: 'new', scaleUser: null };

describe('who a weigh-in belongs to', () => {
  it('gives it to the owner of the scale slot', () => {
    expect(attributeReading({ scaleUser: 2 }, [ALICE, SAM])).toEqual({
      profileId: 'sam',
      attribution: 'scale',
    });
  });

  it('gives it to the only profile when its slot matches or is not linked yet', () => {
    expect(attributeReading({ scaleUser: 1 }, [ALICE])).toEqual({
      profileId: 'alice',
      attribution: 'only_profile',
    });
    expect(attributeReading({ scaleUser: 5 }, [NEW])).toEqual({
      profileId: 'new',
      attribution: 'only_profile',
    });
    expect(attributeReading({ scaleUser: null }, [ALICE])).toEqual({
      profileId: 'alice',
      attribution: 'only_profile',
    });
  });

  it('keeps a weigh-in from another slot away from the only profile', () => {
    expect(attributeReading({ scaleUser: 3 }, [ALICE])).toEqual({
      profileId: null,
      attribution: 'pending',
    });
  });

  it('leaves it pending when the slot belongs to nobody and several people exist', () => {
    expect(attributeReading({ scaleUser: 3 }, [ALICE, SAM])).toEqual({
      profileId: null,
      attribution: 'pending',
    });
    expect(attributeReading({ scaleUser: 3 }, [ALICE, NEW])).toEqual({
      profileId: null,
      attribution: 'pending',
    });
  });

  it('leaves it pending when the scale reported no slot and several people exist', () => {
    expect(attributeReading({ scaleUser: null }, [ALICE, SAM])).toEqual({
      profileId: null,
      attribution: 'pending',
    });
  });

  it('leaves it pending when two people claim the same slot', () => {
    expect(
      attributeReading({ scaleUser: 1 }, [ALICE, { profileId: 'twin', scaleUser: 1 }]),
    ).toEqual({ profileId: null, attribution: 'pending' });
  });

  it('leaves it pending when there are no people', () => {
    expect(attributeReading({ scaleUser: 1 }, [])).toEqual({
      profileId: null,
      attribution: 'pending',
    });
  });
});
