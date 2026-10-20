import type { SignalInput } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  CHAIN_RETENTION_MS,
  FeedbackChains,
  ignoresOwnChange,
} from '../../src/automations/driver/feedback';

function signal(data: SignalInput['data']): SignalInput {
  return {
    source: 'device',
    kind: 'state',
    subject: 'd1',
    field: 'power',
    value: true,
    previous: false,
    at: '2026-10-18T10:00:00.000Z',
    profileId: null,
    data,
  };
}

const caused = (automationId: string, runId: string): SignalInput =>
  signal({
    cause: 'automation',
    causeAutomationId: automationId,
    causeRunId: runId,
    causeDepth: 1,
  });

describe('the cause chain of a trigger', () => {
  it('is empty for a signal nothing caused and for a manual start', () => {
    const chains = new FeedbackChains();
    expect(chains.chainOf(signal({ cause: 'physical' }))).toEqual([]);
    expect(chains.chainOf(null)).toEqual([]);
  });

  it('holds the causing run when it is not known to descend from another', () => {
    expect(new FeedbackChains().chainOf(caused('a', 'r1'))).toEqual([
      { automationId: 'a', runId: 'r1' },
    ]);
  });

  it('extends the chain the causing run started with', () => {
    const chains = new FeedbackChains();
    chains.begin('r2', chains.chainOf(caused('a', 'r1')), 0);
    chains.begin('r3', chains.chainOf(caused('a', 'r2')), 0);
    expect(chains.chainOf(caused('a', 'r3')).map((link) => link.runId)).toEqual(['r1', 'r2', 'r3']);
  });

  it('forgets a run once it ended and the retention passed', () => {
    const chains = new FeedbackChains();
    chains.begin('r2', [{ automationId: 'a', runId: 'r1' }], 0);
    chains.end('r2', 10);
    chains.begin('r9', [], 10 + CHAIN_RETENTION_MS);
    expect(chains.chainOf(caused('a', 'r2'))).toEqual([{ automationId: 'a', runId: 'r2' }]);
  });

  it('keeps a run that has not ended', () => {
    const chains = new FeedbackChains();
    chains.begin('r2', [{ automationId: 'a', runId: 'r1' }], 0);
    chains.begin('r9', [], 10 * CHAIN_RETENTION_MS);
    expect(chains.chainOf(caused('a', 'r2'))).toHaveLength(2);
  });
});

describe('ignoring own changes', () => {
  it('ignores a change the automation itself caused when the option is on', () => {
    expect(ignoresOwnChange('a', true, caused('a', 'r1'))).toBe(true);
  });

  it('keeps changes caused by another automation or by nobody', () => {
    expect(ignoresOwnChange('a', true, caused('b', 'r1'))).toBe(false);
    expect(ignoresOwnChange('a', true, signal({ cause: 'physical' }))).toBe(false);
    expect(ignoresOwnChange('a', true, null)).toBe(false);
  });

  it('keeps own changes when the option is off', () => {
    expect(ignoresOwnChange('a', false, caused('a', 'r1'))).toBe(false);
  });
});
