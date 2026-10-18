import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhoneNodeStatus } from '../../../modules/health-connect';

const native = vi.hoisted(() => {
  class AppUpdateNeededError extends Error {
    override readonly name = 'AppUpdateNeededError';
  }
  return {
    phoneNodeLinked: true,
    AppUpdateNeededError,
    addPhoneEventListener: vi.fn(),
    phoneNodeStatus: vi.fn(),
    startPhoneNode: vi.fn(),
    stopPhoneNode: vi.fn(),
  };
});
const toast = vi.hoisted(() => ({ notify: vi.fn() }));

vi.mock('../../../modules/health-connect', () => native);
vi.mock('../../components/toast-store', () => toast);

const { changePhoneNode, phoneNodeStateOf } = await import('./phone-node');

const STATUS: PhoneNodeStatus = {
  enabled: true,
  sensors: {
    activity: true,
    places: false,
    car: false,
    navigation: false,
    screen_time: false,
    app_usage: false,
    notification_titles: false,
  },
  permissions: {
    activity: true,
    location: false,
    backgroundLocation: false,
    notificationAccess: false,
    dndAccess: false,
    usageAccess: false,
    batteryUnrestricted: false,
    writeSettings: false,
    overlay: false,
    accessibility: false,
  },
  context: { state: 'unknown', since: '2026-10-17T10:00:00.000Z', confidence: 0, place: null },
  car: null,
  carSupported: true,
  homeWifi: null,
  currentWifi: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('phone node state', () => {
  it('keeps the last good status when a later read fails', () => {
    expect(phoneNodeStateOf(true, STATUS, new Error('later read failed'))).toEqual({
      kind: 'ready',
      status: STATUS,
    });
  });

  it('asks for an update when the native module is too old', () => {
    const state = phoneNodeStateOf(true, undefined, new native.AppUpdateNeededError('old'));
    expect(state).toEqual({ kind: 'update_needed', reason: 'old' });
  });

  it('only fails when there never was a status', () => {
    expect(phoneNodeStateOf(true, undefined, new Error('nope'))).toEqual({
      kind: 'failed',
      reason: 'nope',
    });
    expect(phoneNodeStateOf(true, undefined, null)).toEqual({ kind: 'loading' });
    expect(phoneNodeStateOf(false, undefined, null)).toEqual({ kind: 'unsupported' });
  });
});

describe('changePhoneNode', () => {
  it('runs the change without a toast when it works', async () => {
    const work = vi.fn(() => Promise.resolve());
    await changePhoneNode(work);
    expect(work).toHaveBeenCalledTimes(1);
    expect(toast.notify).not.toHaveBeenCalled();
  });

  it('shows a toast when the change fails and does not throw', async () => {
    const failure = new Error('refused');
    await changePhoneNode(() => Promise.reject(failure));
    expect(toast.notify).toHaveBeenCalledWith({
      message: 'The phone setting was not changed',
      error: failure,
      tone: 'critical',
    });
  });
});
