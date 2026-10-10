import type { Rect } from '../components/anchor';
import { ValueStore, useValue } from '../design/external-store';

export interface QuickControlsTarget {
  readonly deviceId: string;
  readonly anchor: Rect | null;
}

const quickControls = new ValueStore<QuickControlsTarget | null>(null);

export function openQuickControls(deviceId: string, anchor: Rect | null = null): void {
  quickControls.set({ deviceId, anchor });
}

export function closeQuickControls(): void {
  quickControls.set(null);
}

export function useQuickControlsTarget(): QuickControlsTarget | null {
  return useValue(quickControls);
}
