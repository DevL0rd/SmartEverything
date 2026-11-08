import { describe, expect, it } from 'vitest';
import { ENGINE, nativeModelOptionReason } from '../src';

const DEVICE = '11111111-1111-4111-8111-111111111111';
const MODEL = { efforts: ['low'], adaptive_thinking: false, fast: false };

const claude = ENGINE.parse({ kind: 'claude', device_id: DEVICE, model: 'sonnet' });
const codex = ENGINE.parse({ kind: 'codex', device_id: DEVICE, model: 'codex' });

describe('native model options', () => {
  it('allows provider defaults and validates the explicit effort', () => {
    if (claude.kind !== 'claude') throw new Error('Expected Claude.');
    expect(nativeModelOptionReason(claude, MODEL)).toBeNull();
    expect(nativeModelOptionReason({ ...claude, effort: 'high' }, MODEL)).toContain('effort');
    expect(nativeModelOptionReason({ ...claude, effort: 'low' }, MODEL)).toBeNull();
  });

  it('requires Claude model support for fast and adaptive modes', () => {
    if (claude.kind !== 'claude') throw new Error('Expected Claude.');
    const adaptive = { ...claude, settings: { ...claude.settings, thinking: 'adaptive' } } as const;
    const fast = { ...claude, settings: { ...claude.settings, fast: true } };
    expect(nativeModelOptionReason(adaptive, MODEL)).toContain('adaptive thinking');
    expect(nativeModelOptionReason(adaptive, { ...MODEL, adaptive_thinking: true })).toBeNull();
    expect(nativeModelOptionReason(fast, MODEL)).toContain('fast mode');
    expect(nativeModelOptionReason(fast, { ...MODEL, fast: true })).toBeNull();
  });

  it('requires Codex to advertise the requested tier', () => {
    if (codex.kind !== 'codex') throw new Error('Expected Codex.');
    const fast = { ...codex, settings: { service_tier: 'fast' } };
    expect(nativeModelOptionReason(codex, MODEL)).toBeNull();
    expect(nativeModelOptionReason(fast, MODEL)).toContain('service tier');
    expect(nativeModelOptionReason(fast, { ...MODEL, service_tiers: ['standard'] })).toContain(
      'service tier',
    );
    expect(nativeModelOptionReason(fast, { ...MODEL, service_tiers: ['fast'] })).toBeNull();
  });
});
