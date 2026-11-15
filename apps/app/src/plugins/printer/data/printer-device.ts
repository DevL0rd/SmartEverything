import { useMatchingDevices } from '../../../store/selectors';
import type { Device } from '../../../store/state';

export function isPrinter(device: { readonly kind: string }): boolean {
  return device.kind === 'printer';
}

export function usePrinters(): readonly Device[] {
  return useMatchingDevices(isPrinter);
}

export function usePrimaryPrinter(): Device | null {
  const printers = usePrinters();
  return printers.find((device) => device.online) ?? printers[0] ?? null;
}
