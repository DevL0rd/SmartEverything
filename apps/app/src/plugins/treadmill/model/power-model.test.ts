import { describe, expect, it } from 'vitest';
import { stateViewFixture } from './fixtures';
import { canStopBelt, powerStateLine } from './power-model';

const NOW = Date.parse('2026-10-18T10:10:00.000Z');

describe('what the power sheet says about the belt', () => {
  it('names the state while the belt is linked', () => {
    const { link } = stateViewFixture({});
    expect(powerStateLine(link, 'paused', NOW)).toBe('Paused');
  });

  it('says standby or switched off when the link drops while stopped', () => {
    const { link } = stateViewFixture({ phase: 'lost' });
    expect(powerStateLine(link, 'stopped', NOW)).toBe('Standby or switched off');
  });

  it('says not reachable with the last time heard', () => {
    const { link } = stateViewFixture({ phase: 'searching' });
    const heard = { ...link, lastHeardAt: '2026-10-18T10:05:00.000Z' };
    expect(powerStateLine(heard, 'running', NOW)).toBe('Not reachable · last heard 5 min ago');
    expect(powerStateLine(link, 'running', NOW)).toBe('Not reachable');
  });

  it('offers Stop belt only while the belt moves and is linked', () => {
    const linked = stateViewFixture({}).link;
    expect(canStopBelt(linked, 'running')).toBe(true);
    expect(canStopBelt(linked, 'paused')).toBe(true);
    expect(canStopBelt(linked, 'stopped')).toBe(false);
    expect(canStopBelt({ ...linked, phase: 'lost' }, 'running')).toBe(false);
  });
});
