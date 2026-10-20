import { ValueStore, useValue } from '../../../design/external-store';

const open = new ValueStore<boolean>(false);

export function openPrintSheet(): void {
  open.set(true);
}

export function closePrintSheet(): void {
  open.set(false);
}

export function usePrintSheetOpen(): boolean {
  return useValue(open);
}
