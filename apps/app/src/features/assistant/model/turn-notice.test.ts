import { describe, expect, it } from 'vitest';
import { actionLabelOf, failedBubbleLabel, noticeOf } from './turn-notice';

describe('turn notice', () => {
  it('labels a resume as Retry after an error and Continue after a quiet stop', () => {
    expect(actionLabelOf('continue', 'critical')).toBe('Retry');
    expect(actionLabelOf('continue', 'warning')).toBe('Retry');
    expect(actionLabelOf('continue', 'variant')).toBe('Continue');
  });

  it('labels every other action as a short text link', () => {
    expect(actionLabelOf('choose_model', 'critical')).toBe('Switch model');
    expect(actionLabelOf('machine_switch', 'critical')).toBe('Switch machine');
    expect(actionLabelOf('top_up', 'critical')).toBe('Top up');
    expect(actionLabelOf('details', 'variant')).toBe('Details');
  });

  it('announces the same specific title the line shows', () => {
    expect(noticeOf('offline', null).title).toBe('The machine went offline.');
    expect(noticeOf('stopped', null).title).toBe('Stopped');
  });

  it('labels a failed own bubble by its reason', () => {
    expect(failedBubbleLabel('stopped')).toBe('Stopped');
    expect(failedBubbleLabel('interrupted')).toBe('Interrupted');
    expect(failedBubbleLabel('credits')).toBe('Not sent');
  });
});
