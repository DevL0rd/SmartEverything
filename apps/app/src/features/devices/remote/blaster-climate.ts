import { useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';

export interface Climate {
  readonly temperature: number | null;
  readonly humidity: number | null;
}

export function useClimate(device: Device): Climate {
  return useDeviceDerived(
    device.id,
    (values) => {
      const temperature = values['temperature']?.value;
      const humidity = values['humidity']?.value;
      return {
        temperature: typeof temperature === 'number' ? temperature : null,
        humidity: typeof humidity === 'number' ? humidity : null,
      };
    },
    [],
  );
}
