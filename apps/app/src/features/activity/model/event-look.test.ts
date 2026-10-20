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

  it('shows an app arriving in green and leaving or going to the back faded', () => {
    expect(eventLook('app_opened')).toEqual({
      icon: 'appWindow',
      tone: 'positive',
      label: 'App opened',
    });
    expect(eventLook('app_focused').tone).toBe('primary');
    expect(eventLook('app_closed').tone).toBe('faint');
    expect(eventLook('app_unfocused').tone).toBe('faint');
  });

  it('resolves a signal row from its recorded label and the signal catalogue', () => {
    expect(eventLook('signal', { source: 'hub', kind: 'storm', label: 'Signals dropped' })).toEqual(
      {
        icon: 'cpu',
        tone: 'critical',
        label: 'Signals dropped',
      },
    );
  });

  it('gives a plugin signal the plug icon and a quiet tone, and a bare row a generic label', () => {
    expect(
      eventLook('signal', { source: 'plugin_router', kind: 'client_joined', label: 'Joined' }),
    ).toEqual({ icon: 'plug', tone: 'variant', label: 'Joined' });
    expect(eventLook('signal')).toEqual({
      icon: 'activity',
      tone: 'variant',
      label: 'Home event',
    });
  });
});
