import { router } from 'expo-router';
import { useEffect } from 'react';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import { ValueStore, useSelected, useValue } from '../../../design/external-store';

export type PanelIntent = 'view' | 'edit' | 'attach';

export interface PlannerSelection {
  readonly itemId: string;
  readonly occurrenceKey: string | null;
  readonly intent: PanelIntent;
}

export const PANEL_WIDTH = { initial: 420, min: 360, max: 560 } as const;

const selection = new ValueStore<PlannerSelection | null>(null);

const hosts = new ValueStore<number>(0);

const panelWidth = new ValueStore<number>(PANEL_WIDTH.initial);

export function isSelected(
  current: PlannerSelection | null,
  itemId: string,
  occurrenceKey: string | null,
): boolean {
  if (current?.itemId !== itemId) return false;
  return current.occurrenceKey === null || current.occurrenceKey === occurrenceKey;
}

export function selectPlannerItem(next: PlannerSelection): void {
  selection.set(next);
}

export function clearPlannerSelection(): void {
  selection.set(null);
}

export function readPlannerSelection(): PlannerSelection | null {
  return selection.get();
}

export function usePlannerSelection(): PlannerSelection | null {
  return useValue(selection);
}

export function useItemSelected(itemId: string, occurrenceKey: string | null): boolean {
  return useSelected(selection, (current) => isSelected(current, itemId, occurrenceKey));
}

export function usePanelHosted(): boolean {
  return useSelected(hosts, (count) => count > 0);
}

export function usePanelHost(): void {
  useEffect(() => {
    hosts.update((count) => count + 1);
    return (): void => {
      hosts.update((count) => count - 1);
      if (hosts.get() === 0) clearPlannerSelection();
    };
  }, []);
}

export function usePanelWidth(): number {
  return useValue(panelWidth);
}

export function setPanelWidth(width: number): void {
  panelWidth.set(width);
}

export function itemHrefOf(itemId: string, occurrenceKey: string | null): AppHref {
  return href.planner.item(itemId, occurrenceKey);
}

export function openPlannerItem(
  target: Omit<PlannerSelection, 'intent'>,
  intent: PanelIntent,
  hosted: boolean,
): void {
  if (hosted) {
    selectPlannerItem({ ...target, intent });
    return;
  }
  router.push(itemHrefOf(target.itemId, target.occurrenceKey));
}

export type ItemOpen =
  | { readonly href: AppHref; readonly selected: false }
  | { readonly onPress: () => void; readonly selected: boolean };

export function useItemOpen(itemId: string, occurrenceKey: string | null): ItemOpen {
  const hosted = usePanelHosted();
  const selected = useItemSelected(itemId, occurrenceKey);
  if (!hosted) return { href: itemHrefOf(itemId, occurrenceKey), selected: false };
  return {
    selected,
    onPress: (): void => {
      selectPlannerItem({ itemId, occurrenceKey, intent: 'view' });
    },
  };
}
