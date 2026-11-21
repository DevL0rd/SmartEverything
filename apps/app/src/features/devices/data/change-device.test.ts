import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityStore } from '../../../store/entity-store';
import { deviceEdit } from '../../../store/optimistic';
import { deviceFixture } from '../../../store/device-fixture';
import type { Device } from '../../../store/state';

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

const device = deviceFixture(1, { favourite: false, hidden: false });

function storeWith(row: Device): EntityStore {
  const store = new EntityStore();
  store.update(deviceEdit(row, row).apply);
  return store;
}

function shown(store: EntityStore): Device | undefined {
  return store.get().tables.devices.byId[device.id];
}

describe('changeDevice', () => {
  beforeEach(() => {
    updateDevice.mockReset();
    notify.mockReset();
  });

  it('shows the change before the hub answers and stays quiet on success', async () => {
    let answer: () => void = () => undefined;
    updateDevice.mockImplementation(
      () =>
        new Promise<void>((done) => {
          answer = done;
        }),
    );
    const { changeDevice } = await import('./change-device');
    const store = storeWith(device);
    changeDevice(store, device, 'Lamp', { favourite: true });
    expect(shown(store)?.favourite).toBe(true);
    expect(updateDevice).toHaveBeenCalledWith(device.id, { favourite: true });
    answer();
    await Promise.resolve();
    expect(shown(store)?.favourite).toBe(true);
    expect(notify).not.toHaveBeenCalled();
  });

  it('shows a new name with its label at once', async () => {
    updateDevice.mockResolvedValue(undefined);
    const { writeDevice } = await import('./change-device');
    const store = storeWith(device);
    const saved = writeDevice(store, device.id, { display_name: 'Reading lamp' });
    expect(shown(store)?.label).toBe('Reading lamp');
    await saved;
  });

  it('rolls the change back and names the device in a critical toast when it is rejected', async () => {
    const failure = new Error('offline');
    updateDevice.mockRejectedValue(failure);
    const { changeDevice } = await import('./change-device');
    const store = storeWith(device);
    changeDevice(store, device, 'Lamp', { hidden: true });
    expect(shown(store)?.hidden).toBe(true);
    await vi.waitFor(() => {
      expect(notify).toHaveBeenCalledWith({
        message: 'Lamp was not changed',
        error: failure,
        tone: 'critical',
      });
    });
    expect(shown(store)?.hidden).toBe(false);
  });
});
