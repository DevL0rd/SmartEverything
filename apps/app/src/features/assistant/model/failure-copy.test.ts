import { describe, expect, it } from 'vitest';
import { ASSISTANT_REASON_CODES } from '@smarteverything/domain';
import { failureCopy, PLAIN_ERROR, type FailureContext } from './failure-copy';

const context: FailureContext = { model: 'Sonnet 4.5', reason: null };

describe('failureCopy', () => {
  it('maps credits to a top-up and a model change', () => {
    const copy = failureCopy('credits', context);
    expect(copy.title).toBe('Out of OpenRouter credits');
    expect(copy.body).toBe('Add credit or pick a model on another plan.');
    expect(copy.actions).toEqual(['top_up', 'choose_model']);
  });

  it('answers a rate limit, an offline machine and an unknown stop with the same plain error', () => {
    for (const code of ['rate_limit', 'offline', 'unknown'] as const) {
      const copy = failureCopy(code, { ...context, reason: 'provider.exit code 137' });
      expect(copy.title).toBe(PLAIN_ERROR);
      expect(copy.body).toBeNull();
    }
    expect(failureCopy('rate_limit', context).actions).toEqual(['choose_model']);
    expect(failureCopy('offline', context).actions).toEqual(['machine_switch']);
    expect(failureCopy(null, context).actions).toEqual([]);
    expect(PLAIN_ERROR).not.toMatch(/try again/i);
  });

  it('never shows the server reason for an unavailable model', () => {
    const copy = failureCopy('model_unavailable', { ...context, reason: 'Route withdrew it' });
    expect(copy.title).toBe('Sonnet 4.5 isn’t available');
    expect(copy.body).toBeNull();
    expect(copy.actions).toEqual(['choose_model']);
  });

  it('shows an interrupted reply as a quiet note with the hub reason and a continue action', () => {
    const copy = failureCopy('interrupted', {
      ...context,
      reason: 'The hub restarted.',
    });
    expect(copy).toMatchObject({
      tone: 'neutral',
      title: 'Interrupted',
      body: 'The hub restarted.',
    });
    expect(copy.actions).toEqual(['continue']);
  });

  it('treats a stopped reply as neutral with a continue action', () => {
    const copy = failureCopy('stopped', context);
    expect(copy).toMatchObject({ tone: 'neutral', title: 'Stopped', body: null });
    expect(copy.actions).toEqual(['continue']);
  });

  it('falls back to a generic model name', () => {
    const empty = { model: null, reason: null };
    expect(failureCopy('model_unavailable', empty).title).toBe('The model isn’t available');
  });

  it('covers every reason code with a title and never offers to retry', () => {
    for (const code of ASSISTANT_REASON_CODES) {
      const copy = failureCopy(code, context);
      expect(copy.title).not.toBe('');
      expect(copy.actions).not.toContain('retry');
    }
  });
});
