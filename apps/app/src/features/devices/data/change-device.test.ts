import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateDevice = vi.hoisted(() => vi.fn());
const notify = vi.hoisted(() => vi.fn());

vi.mock('../../../api/devices', () => ({ updateDevice }));
vi.mock('../../../components/toast-store', () => ({
  notifyFailure:
    (message: string) =>
    (error: unknown): void => {
      notify({ message, error, tone: 'critical' });
    },
}));

const device = { id: 'lamp-1' };

describe('changeDevice', () => {
  beforeEach(() => {
    updateDevice.mockReset();
    notify.mockReset();
  });

  it('sends the patch for the device and stays quiet on success', async () => {
    updateDevice.mockResolvedValue(undefined);
    const { changeDevice } = await import('./change-device');
    changeDevice(device, 'Lamp', { favourite: true });
    await Promise.resolve();
    expect(updateDevice).toHaveBeenCalledWith('lamp-1', { favourite: true });
    expect(notify).not.toHaveBeenCalled();
  });

  it('names the device in a critical toast when the change is rejected', async () => {
    const failure = new Error('offline');
    updateDevice.mockRejectedValue(failure);
    const { changeDevice } = await import('./change-device');
    changeDevice(device, 'Lamp', { hidden: true });
    await vi.waitFor(() => {
      expect(notify).toHaveBeenCalledWith({
        message: 'Lamp was not changed',
        error: failure,
        tone: 'critical',
      });
    });
  });
});
