import { describe, expect, it } from 'vitest';
import type { ProviderLinkRow } from '@smarteverything/domain';
import { inProgress, stageOf, stepIndexOf } from './link-stage';

function row(change: Partial<ProviderLinkRow> = {}): ProviderLinkRow {
  return {
    provider: 'xiaomi',
    account_label: null,
    status: 'linking',
    prompt: null,
    phase: null,
    problem: null,
    last_error: null,
    device_count: 0,
    updated_at: '2026-10-16T10:00:00.000Z',
    ...change,
  };
}

describe('stageOf', () => {
  it('shows the form when nothing was sent and no link is in progress', () => {
    expect(stageOf(null, null)).toEqual({ kind: 'form' });
    expect(stageOf(row({ status: 'linked' }), null)).toEqual({ kind: 'form' });
    expect(stageOf(row({ status: 'needs_attention' }), null)).toEqual({ kind: 'form' });
  });

  it('picks up a link that is already in progress when nothing was sent', () => {
    expect(stageOf(row({ phase: 'discovering' }), null)).toEqual({
      kind: 'working',
      phase: 'discovering',
    });
  });

  it('keeps working on the first step until the hub row changes after sending', () => {
    const sent = { baseline: '2026-10-16T10:00:00.000Z' };
    expect(stageOf(null, sent)).toEqual({ kind: 'working', phase: 'signing_in' });
    expect(stageOf(row({ status: 'linked' }), sent)).toEqual({
      kind: 'working',
      phase: 'signing_in',
    });
  });

  it('follows the row once it changed after sending', () => {
    const sent = { baseline: '2026-10-16T09:00:00.000Z' };
    expect(stageOf(row({ status: 'linked' }), sent).kind).toBe('done');
    expect(stageOf(row({ phase: 'awaiting_answer' }), sent)).toEqual({
      kind: 'working',
      phase: 'awaiting_answer',
    });
    expect(stageOf(row(), sent)).toEqual({ kind: 'working', phase: 'signing_in' });
  });

  it('shows a prompt before the status', () => {
    const prompt = { kind: 'verification_code', destination: 'a@b.c' } as const;
    expect(stageOf(row({ prompt }), { baseline: null })).toEqual({ kind: 'prompt', prompt });
  });

  it('fails with the problem and detail, unknown when the hub gave none', () => {
    const sent = { baseline: null };
    expect(
      stageOf(row({ status: 'needs_attention', problem: 'network', last_error: 'timeout' }), sent),
    ).toEqual({ kind: 'failed', problem: 'network', detail: 'timeout' });
    expect(stageOf(row({ status: 'unlinked' }), sent)).toEqual({
      kind: 'failed',
      problem: 'unknown',
      detail: null,
    });
  });
});

describe('inProgress and stepIndexOf', () => {
  it('is in progress while working or asking, and numbers the steps', () => {
    expect(inProgress({ kind: 'form' })).toBe(false);
    expect(inProgress({ kind: 'working', phase: 'signing_in' })).toBe(true);
    expect(inProgress({ kind: 'failed', problem: 'network', detail: null })).toBe(false);
    expect(stepIndexOf({ kind: 'form' })).toBe(-1);
    expect(stepIndexOf({ kind: 'working', phase: 'signing_in' })).toBe(0);
    expect(stepIndexOf({ kind: 'working', phase: 'awaiting_answer' })).toBe(1);
    expect(stepIndexOf({ kind: 'working', phase: 'discovering' })).toBe(2);
    expect(
      stepIndexOf({ kind: 'prompt', prompt: { kind: 'accept_on_device', device: 'Phone' } }),
    ).toBe(1);
    expect(stepIndexOf({ kind: 'failed', problem: 'network', detail: null })).toBe(3);
  });
});
