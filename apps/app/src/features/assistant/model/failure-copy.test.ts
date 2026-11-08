import { describe, expect, it } from 'vitest';
import { ASSISTANT_REASON_CODES } from '@smarteverything/domain';
import { failureCopy, PLAIN_ERROR, type FailureContext } from './failure-copy';

const context: FailureContext = { model: 'Sonnet 4.5', reason: null };

const LINE_BUDGET = 40;

describe('failureCopy', () => {
  it('names the specific reason for every code and never the plain error', () => {
    for (const code of ASSISTANT_REASON_CODES) {
      const copy = failureCopy(code, context);
      expect(copy.title).not.toBe('');
      expect(copy.title).not.toBe(PLAIN_ERROR);
      expect(copy.title.length).toBeLessThanOrEqual(LINE_BUDGET);
    }
    expect(failureCopy(null, context).title).toBe('The reply failed.');
  });

  it('keeps the native provider’s exact text for the details sheet only', () => {
    const reason = 'Codex could not send this turn because the account is signed out.';
    const native = failureCopy('unknown', { ...context, reason, native: true });
    expect(native.title).toBe('The reply failed.');
    expect(native.detail).toBe(reason);
    expect(native.actions).toEqual(['continue', 'details']);
    const hidden = failureCopy('unknown', { ...context, reason });
    expect(hidden.detail).toBeNull();
    expect(hidden.actions).toEqual(['continue']);
  });

  it('maps credits to a top-up and a model change', () => {
    const copy = failureCopy('credits', context);
    expect(copy).toMatchObject({ tone: 'critical', title: 'Out of OpenRouter credits.' });
    expect(copy.actions).toEqual(['top_up', 'choose_model']);
  });

  it('shows a rate limit as a soft warning that can be retried or moved to another model', () => {
    const copy = failureCopy('rate_limit', { ...context, reason: 'HTTP 429' });
    expect(copy).toMatchObject({ tone: 'warning', icon: 'clock', detail: null });
    expect(copy.actions).toEqual(['continue', 'choose_model']);
  });

  it('offers a retry and a machine switch when the machine went offline', () => {
    const copy = failureCopy('offline', context);
    expect(copy).toMatchObject({ tone: 'critical', title: 'The machine went offline.' });
    expect(copy.actions).toEqual(['continue', 'machine_switch']);
  });

  it('never shows the server reason for an unavailable model', () => {
    const copy = failureCopy('model_unavailable', { ...context, reason: 'Route withdrew it' });
    expect(copy.title).toBe('Sonnet 4.5 isn’t available.');
    expect(copy.detail).toBeNull();
    expect(copy.actions).toEqual(['choose_model']);
    expect(failureCopy('model_unavailable', { model: null, reason: null }).title).toBe(
      'The model isn’t available.',
    );
  });

  it('shows an interruption quietly with the hub reason behind Details', () => {
    const copy = failureCopy('interrupted', { ...context, reason: 'The hub restarted.' });
    expect(copy).toMatchObject({
      tone: 'variant',
      title: 'Interrupted',
      detail: 'The hub restarted.',
    });
    expect(copy.actions).toEqual(['continue', 'details']);
    expect(failureCopy('interrupted', context).actions).toEqual(['continue']);
  });

  it('treats a stopped reply as a quiet line with a continue action', () => {
    const copy = failureCopy('stopped', context);
    expect(copy).toMatchObject({ tone: 'variant', icon: 'square', title: 'Stopped', detail: null });
    expect(copy.actions).toEqual(['continue']);
  });
});
