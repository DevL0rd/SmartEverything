import { LAUNDRY_EVENT_FAMILY } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { eventLook } from './event-look';

describe('eventLook', () => {
  it('gives a doorbell press a warning bell', () => {
    expect(eventLook('doorbell')).toEqual({ icon: 'bell', tone: 'warning', label: 'Doorbell' });
  });

  it('gives a stored recording a film icon and its own label', () => {
    expect(eventLook('recording')).toEqual({ icon: 'film', tone: 'variant', label: 'Recording' });
  });

  it('marks danger events critical', () => {
    for (const kind of ['alarm', 'leak', 'smoke', 'fault', 'provider_error'] as const) {
      expect(eventLook(kind).tone).toBe('critical');
    }
  });

  it('tells a finished laundry cycle from any other finished cycle', () => {
    expect(eventLook('cycle_finished').label).toBe('Cycle finished');
    expect(eventLook('cycle_finished', { family: LAUNDRY_EVENT_FAMILY }).label).toBe(
      'Laundry done',
    );
    expect(
      eventLook('cycle_finished', { family: LAUNDRY_EVENT_FAMILY, outcome: 'stopped' }).label,
    ).toBe('Laundry stopped');
  });

  it('fades the end of movement against the start of it', () => {
    expect(eventLook('motion').tone).toBe('primary');
    expect(eventLook('no_motion').tone).toBe('faint');
  });
});
