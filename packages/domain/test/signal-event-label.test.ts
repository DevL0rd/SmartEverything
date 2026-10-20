import { describe, expect, it } from 'vitest';
import { eventKeywords, eventLabel } from '../src/event-labels';
import { SIGNAL_SOURCES, kindSpecOf } from '../src/signal-sources';

describe('the signal event kind', () => {
  it('is named by the label recorded with it, or by a generic label when there is none', () => {
    expect(eventLabel('signal', { label: 'Signals dropped in a flood' })).toBe(
      'Signals dropped in a flood',
    );
    expect(eventLabel('signal', { label: '' })).toBe('Home event');
    expect(eventLabel('signal', {})).toBe('Home event');
  });

  it('is found by the source and kind it was recorded from', () => {
    expect(eventKeywords('signal', { source: 'hub', kind: 'storm', value: true })).toStrictEqual([
      'hub',
      'storm',
    ]);
  });

  it('never appears as a trigger of its own, since the signal it records already fired', () => {
    expect(kindSpecOf(SIGNAL_SOURCES, { source: 'event', kind: 'signal' })).toBeUndefined();
    expect(kindSpecOf(SIGNAL_SOURCES, { source: 'event', kind: 'motion' })).toBeDefined();
  });
});
