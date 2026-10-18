import { ATTRIBUTIONS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { attributionLook } from './attribution-model';

describe('attributionLook', () => {
  it('names every way a weigh-in can be attributed', () => {
    for (const attribution of ATTRIBUTIONS) {
      expect(attributionLook(attribution).label.length).toBeGreaterThan(0);
    }
  });

  it('calls a weigh-in the person confirmed Confirmed and one nobody claimed Needs a person', () => {
    expect(attributionLook('person')).toEqual({ label: 'Confirmed', tone: 'primary' });
    expect(attributionLook('pending')).toEqual({ label: 'Needs a person', tone: 'warning' });
  });

  it('shows both guesses the same way so they read as unconfirmed', () => {
    expect(attributionLook('only_profile')).toEqual(attributionLook('weight'));
    expect(attributionLook('only_profile').label).toBe('Guessed');
  });

  it('shows an ignored weigh-in as a guest', () => {
    expect(attributionLook('ignored').label).toBe('Guest');
  });
});
