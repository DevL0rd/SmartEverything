import { useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { printerFactsOf } from './printer-facts';
import { parseDetails, printerLiveOf, type PrinterLive } from './printer-live';
import type { PrinterFacts } from '../types';

export function usePrinterLive(device: Device): PrinterLive | null {
  return useDeviceDerived(
    device.id,
    (values) => {
      const details = parseDetails(device.details);
      return details === null ? null : printerLiveOf(details, values, device.online);
    },
    [device.details, device.online],
  );
}

export function usePrinterFacts(device: Device): PrinterFacts | null {
  const live = usePrinterLive(device);
  return live === null ? null : printerFactsOf(live);
}
