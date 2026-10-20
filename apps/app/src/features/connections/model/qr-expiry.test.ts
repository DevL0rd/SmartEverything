import type { ProviderLinkRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { qrMinutesLeft, qrShareLeft } from './qr-expiry';

const EXPIRES = '2026-10-16T10:05:00.000Z';
const START = Date.parse('2026-10-16T10:00:00.000Z');

function rowWith(
  prompt: ProviderLinkRow['prompt'],
  updatedAt = '2026-10-16T10:00:00.000Z',
): ProviderLinkRow {
  return {
    provider: 'tuya',
    account_label: null,
    status: 'linking',
    prompt,
    phase: 'awaiting_answer',
    problem: null,
    last_error: null,
    device_count: 0,
    updated_at: updatedAt,
  };
}

const QR = {
  kind: 'scan_qr',
  app: 'Smart Life',
  content: 'qr',
  issuedAt: '2026-10-16T10:00:00.000Z',
  expiresAt: EXPIRES,
} as const;
const QR_FROM_OLD_HUB = {
  kind: 'scan_qr',
  app: 'Smart Life',
  content: 'qr',
  expiresAt: EXPIRES,
} as const;

describe('qrMinutesLeft', () => {
  it('counts down from the hub-given expiry, one minute at a time', () => {
    expect(qrMinutesLeft(rowWith(QR), START)).toBe(5);
    expect(qrMinutesLeft(rowWith(QR), START + 60_000)).toBe(4);
    expect(qrMinutesLeft(rowWith(QR), START + 4 * 60_000 + 1)).toBe(1);
  });

  it('does not restart when the link row is updated', () => {
    const now = START + 2 * 60_000;
    const first = qrMinutesLeft(rowWith(QR, '2026-10-16T10:00:00.000Z'), now);
    const updated = qrMinutesLeft(rowWith(QR, '2026-10-16T10:01:30.000Z'), now);
    expect(first).toBe(3);
    expect(updated).toBe(first);
  });

  it('reaches zero at the expiry and goes negative after it', () => {
    expect(qrMinutesLeft(rowWith(QR), Date.parse(EXPIRES))).toBe(0);
    expect(qrMinutesLeft(rowWith(QR), Date.parse(EXPIRES) + 61_000)).toBeLessThan(0);
  });

  it('has nothing to count for other prompts or no row', () => {
    expect(qrMinutesLeft(null, START)).toBeNull();
    expect(qrMinutesLeft(rowWith(null), START)).toBeNull();
    expect(
      qrMinutesLeft(rowWith({ kind: 'verification_code', destination: 'a***@b.c' }), START),
    ).toBeNull();
  });
});

describe('qrShareLeft', () => {
  it('is the share of the hub-given lifetime still left, from full to empty', () => {
    expect(qrShareLeft(rowWith(QR), START)).toBe(1);
    expect(qrShareLeft(rowWith(QR), START + 150_000)).toBe(0.5);
    expect(qrShareLeft(rowWith(QR), Date.parse(EXPIRES))).toBe(0);
  });

  it('follows the lifetime the hub gave, not a fixed one', () => {
    const tenMinutes = { ...QR, expiresAt: '2026-10-16T10:10:00.000Z' } as const;
    expect(qrShareLeft(rowWith(tenMinutes), START + 150_000)).toBe(0.75);
  });

  it('has no share when the hub gave no issue time or an empty lifetime', () => {
    expect(qrShareLeft(rowWith(QR_FROM_OLD_HUB), START)).toBeNull();
    expect(qrMinutesLeft(rowWith(QR_FROM_OLD_HUB), START)).toBe(5);
    expect(qrShareLeft(rowWith({ ...QR, issuedAt: EXPIRES }), START)).toBeNull();
  });

  it('stays inside zero and one and has nothing for other prompts', () => {
    expect(qrShareLeft(rowWith(QR), START - 60_000)).toBe(1);
    expect(qrShareLeft(rowWith(QR), Date.parse(EXPIRES) + 60_000)).toBe(0);
    expect(qrShareLeft(null, START)).toBeNull();
    expect(qrShareLeft(rowWith(null), START)).toBeNull();
  });
});
