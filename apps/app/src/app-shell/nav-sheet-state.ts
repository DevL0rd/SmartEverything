import { makeMutable, withSpring } from 'react-native-reanimated';
import { ValueStore } from '../design/external-store';
import { SPRING } from '../design/motion';
import type { NavEntry } from './nav-model';
import type { TabKey } from './route-types';

export type NavSheetPhase = 'closed' | 'open' | 'full';

export interface NavSheetStops {
  readonly half: number;
  readonly full: number;
}

export const navSheetLift = makeMutable(0);
export const navSheetStops = makeMutable<NavSheetStops>({ half: 0, full: 0 });
export const navSheetReduced = makeMutable(false);
export const navSheetPhase = new ValueStore<NavSheetPhase>('closed');
export const navSheetQuery = new ValueStore('');
export const navSheetFocus = new ValueStore(false);
export const navCurrent = new ValueStore<TabKey>('home');

export function liftOf(phase: NavSheetPhase, stops: NavSheetStops): number {
  'worklet';
  if (phase === 'closed') {
    return 0;
  }
  return phase === 'open' ? stops.half : stops.full;
}

export function settleNavSheet(phase: NavSheetPhase, velocity: number): void {
  'worklet';
  const target = liftOf(phase, navSheetStops.get());
  navSheetLift.set(navSheetReduced.get() ? target : withSpring(target, { ...SPRING, velocity }));
}

export function commitNavSheetPhase(phase: NavSheetPhase): void {
  navSheetPhase.set(phase);
}

function moveTo(phase: NavSheetPhase): void {
  navSheetPhase.set(phase);
  settleNavSheet(phase, 0);
}

export function openNavSheet(): void {
  moveTo('open');
}

export function expandNavSheet(): void {
  moveTo('full');
}

export function closeNavSheet(): void {
  moveTo('closed');
}

export function searchInNavSheet(query: string): void {
  navSheetQuery.set(query);
  moveTo('full');
  navSheetFocus.set(true);
}

let boundGo: ((entry: NavEntry) => void) | null = null;

export function bindNavGo(go: (entry: NavEntry) => void): () => void {
  boundGo = go;
  return (): void => {
    if (boundGo === go) {
      boundGo = null;
    }
  };
}

export function goFromDirectory(entry: NavEntry): void {
  if (boundGo === null) {
    throw new Error('Navigation is not ready yet.');
  }
  closeNavSheet();
  boundGo(entry);
}
