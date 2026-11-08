import { describe, expect, it } from 'vitest';
import type { ModelOverrideRow } from '@smarteverything/domain';
import { deviceModelsQueryKey, overridesFingerprint } from './use-model-page';

function row(updatedAt: string): ModelOverrideRow {
  return {
    scope: 'device',
    target: 'lamp-1',
    model_id: 'dev.light.bulb',
    asset_hash: null,
    finish: null,
    params: {},
    set_by: 'owner',
    updated_at: updatedAt,
  };
}

describe('model and look page data', () => {
  it('refetches the device models when a synced override row changes', () => {
    const before = overridesFingerprint([row('2026-11-02T10:00:00.000Z')]);
    const after = overridesFingerprint([row('2026-11-02T10:05:00.000Z')]);
    expect(deviceModelsQueryKey('lamp-1', before)).not.toEqual(
      deviceModelsQueryKey('lamp-1', after),
    );
    expect(overridesFingerprint([])).toBe('');
  });

  it('loads the screen module', async () => {
    const screen = await import('./model-settings');
    expect(typeof screen.ModelSettingsScreen).toBe('function');
    expect(screen.RESET_LABEL).toBe('Use the provided model');
  });
});
