import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  closeFlow: vi.fn(),
  notify: vi.fn(),
  overlayStatus: vi.fn(),
  showOverlaySettings: vi.fn(),
  overlayPlatform: vi.fn(),
  enabled: { value: true },
}));

vi.mock('../../../app-shell/close-flow', () => ({ closeFlow: mocks.closeFlow }));
vi.mock('../../../components/toast-store', () => ({ notify: mocks.notify }));
vi.mock('../../../store/local-prefs', () => ({
  localPref: (): { readonly enabled: boolean } => ({ enabled: mocks.enabled.value }),
}));
vi.mock('./overlay-native', () => ({ overlayStatus: mocks.overlayStatus }));
vi.mock('./overlay-permission-row', () => ({ showOverlaySettings: mocks.showOverlaySettings }));
vi.mock('./overlay-surface', () => ({ overlayPlatform: mocks.overlayPlatform }));

const { canMinimizeCall, MinimizeUnavailable, minimizeCall, minimizeStep } =
  await import('./overlay-minimize');

describe('choosing how to minimize a call', () => {
  it('asks to turn the overlay on when it is switched off, on either platform', () => {
    expect(minimizeStep({ platform: 'phone', enabled: false, canDraw: true })).toBe('enable');
    expect(minimizeStep({ platform: 'desktop', enabled: false, canDraw: null })).toBe('enable');
  });

  it('leaves the call page on the phone only when it may draw over other apps', () => {
    expect(minimizeStep({ platform: 'phone', enabled: true, canDraw: true })).toBe('leave');
    expect(minimizeStep({ platform: 'phone', enabled: true, canDraw: false })).toBe('allow');
  });

  it('leaves the call page on desktop so the compact overlay takes over', () => {
    expect(minimizeStep({ platform: 'desktop', enabled: true, canDraw: null })).toBe('leave');
  });
});

describe('minimizing the call', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.value = true;
    mocks.overlayPlatform.mockReturnValue('phone');
    mocks.overlayStatus.mockReturnValue({ canDrawOverlays: true });
  });

  it('leaves the call page on the phone so the overlay shows inside the app', () => {
    minimizeCall();
    expect(mocks.closeFlow).toHaveBeenCalledWith('/');
    expect(mocks.showOverlaySettings).not.toHaveBeenCalled();
  });

  it('opens the existing overlay permission page and keeps the call on screen without permission', () => {
    mocks.overlayStatus.mockReturnValue({ canDrawOverlays: false });
    minimizeCall();
    expect(mocks.showOverlaySettings).toHaveBeenCalledTimes(1);
    expect(mocks.closeFlow).not.toHaveBeenCalled();
  });

  it('tells the user to switch the overlay on instead of leaving when it is off', () => {
    mocks.enabled.value = false;
    minimizeCall();
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.closeFlow).not.toHaveBeenCalled();
  });

  it('leaves the call page on desktop', () => {
    mocks.overlayPlatform.mockReturnValue('desktop');
    minimizeCall();
    expect(mocks.closeFlow).toHaveBeenCalledWith('/');
  });

  it('refuses where there is no overlay, and the button is not offered there', () => {
    mocks.overlayPlatform.mockReturnValue(null);
    expect(canMinimizeCall()).toBe(false);
    expect(() => {
      minimizeCall();
    }).toThrow(MinimizeUnavailable);
  });
});
