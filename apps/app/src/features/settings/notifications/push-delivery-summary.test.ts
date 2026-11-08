import type { PushStatus } from '@smarteverything/domain';
import { expect, it } from 'vitest';
import { deliverySummary } from './push-delivery-summary';

const NOW = Date.parse('2026-11-06T10:00:00.000Z');

const EMPTY: PushStatus = {
  lastAttemptAt: null,
  lastSentAt: null,
  lastError: null,
  sent: 0,
  failed: 0,
  removed: 0,
};

it('distinguishes a loading status query from a query that failed', () => {
  expect(deliverySummary({ data: undefined, isError: false }, NOW)).toEqual({
    text: 'Checking the last alert',
    tone: 'variant',
  });
  expect(deliverySummary({ data: undefined, isError: true }, NOW)).toEqual({
    text: 'Couldn’t check the last alert',
    tone: 'critical',
  });
});

it('keeps the full delivery failure and distinguishes it from no delivery', () => {
  const lastError = 'Provider rejected the delivery. Review the service account key.';
  expect(deliverySummary({ data: { ...EMPTY, lastError }, isError: false }, NOW)).toEqual({
    text: `Last alert failed · ${lastError}`,
    tone: 'critical',
  });
  expect(deliverySummary({ data: EMPTY, isError: false }, NOW)).toEqual({
    text: 'No alert sent yet',
    tone: 'variant',
  });
});
