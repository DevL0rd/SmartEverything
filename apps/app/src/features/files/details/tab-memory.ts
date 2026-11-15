import { ValueStore, useValue } from '../../../design/external-store';

export const DEFAULT_TAB = 'info';

const rememberedTab = new ValueStore<string>(DEFAULT_TAB);

export function rememberTab(tab: string): void {
  rememberedTab.set(tab);
}

export function readRememberedTab(): string {
  return rememberedTab.get();
}

export function useRememberedTab(): string {
  return useValue(rememberedTab);
}
