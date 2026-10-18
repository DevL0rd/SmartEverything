import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_OVERLAY_PREFS, type OverlayAction } from '@smarteverything/domain';

const fake = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>();
  return {
    handlers,
    overlayStatus: vi.fn((): unknown => ({
      host: 'window',
      assistantRole: true,
      canDrawOverlays: true,
      batteryUnrestricted: false,
    })),
    setOverlayPrefs: vi.fn((_json: string) => Promise.resolve()),
    addListener: vi.fn((name: string, handler: (payload: unknown) => void) => {
      handlers.set(name, handler);
      return { remove: vi.fn() };
    }),
  };
});

vi.mock('expo', () => ({
  NativeModule: Object,
  requireOptionalNativeModule: (): typeof fake => fake,
}));

vi.mock('../../../../modules/health-connect/src/health-connect', () => ({
  AppUpdateNeededError: class extends Error {},
}));

const binding = await import('../../../../modules/health-connect/src/assistant-overlay');

describe('the call bar native binding', () => {
  it('reads the assistant role, overlay and battery state', () => {
    expect(binding.overlayStatus()).toEqual({
      host: 'window',
      assistantRole: true,
      canDrawOverlays: true,
      batteryUnrestricted: false,
    });
  });

  it('rejects a status the native side did not fill in', () => {
    fake.overlayStatus.mockReturnValueOnce({ host: 'window' });
    expect(() => binding.overlayStatus()).toThrow();
  });

  it('sends the phone prefs with the theme as one json document', async () => {
    await binding.setOverlayPrefs({ ...DEFAULT_OVERLAY_PREFS, theme: 'light' });
    expect(JSON.parse(fake.setOverlayPrefs.mock.calls[0]?.[0] ?? '')).toEqual({
      ...DEFAULT_OVERLAY_PREFS,
      theme: 'light',
    });
  });

  it('turns call bar presses into overlay actions', () => {
    const seen: OverlayAction[] = [];
    binding.addOverlayActionListener((action) => {
      seen.push(action);
    });
    fake.handlers.get('onOverlayAction')?.({ action: 'stop_share' });
    expect(seen).toEqual([{ kind: 'stop_share' }]);
  });
});
