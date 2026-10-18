import { describe, expect, it } from 'vitest';
import { openingDetent } from '../../../components/pull-up-math';
import { detailsTargetOf } from './details-target';

describe('detailsTargetOf', () => {
  it('opens the named section', () => {
    expect(detailsTargetOf({ section: 'files' })).toEqual({ tab: 'files', agent: null });
    expect(detailsTargetOf({ section: 'tools' })).toEqual({ tab: 'tools', agent: null });
  });

  it('opens Overview when nothing or an unknown section is asked for', () => {
    expect(detailsTargetOf({})).toEqual({ tab: 'overview', agent: null });
    expect(detailsTargetOf({ section: 'nonsense' })).toEqual({ tab: 'overview', agent: null });
  });

  it('opens Activity with the run when an agent is asked for, whatever the section', () => {
    expect(detailsTargetOf({ agent: 'run-1' })).toEqual({ tab: 'activity', agent: 'run-1' });
    expect(detailsTargetOf({ section: 'files', agent: 'run-1' })).toEqual({
      tab: 'activity',
      agent: 'run-1',
    });
  });

  it('opens every deep link at half height, and full in a short window', () => {
    expect(openingDetent(false)).toBe('half');
    expect(openingDetent(true)).toBe('full');
  });
});
