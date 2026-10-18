import { lastPressOf, pressesOf, type Press } from '../../device-visuals';
import { memoOnInputs } from '../../../store/memo-selector';
import { sameJson } from '../../../store/same-json';
import { rowsOf, type StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import {
  meaningOf,
  pressDayWindow,
  stripSegments,
  weekCounts,
  type Meaning,
  type PressSegment,
  type PressWindow,
  type WeekCounts,
} from './press-model';

export interface ButtonView {
  readonly last: Press | null;
  readonly strip: readonly PressSegment[];
  readonly window: PressWindow;
  readonly week: WeekCounts;
  readonly meaning: readonly Meaning[];
}

function viewOf(state: StoreState, deviceId: string): ButtonView {
  const events = rowsOf(state.tables.events);
  const now = Date.now();
  const window = pressDayWindow(now);
  return {
    last: lastPressOf(events, deviceId),
    strip: stripSegments(pressesOf(events, deviceId, window.from)),
    window,
    week: weekCounts(events, deviceId, now),
    meaning: meaningOf(rowsOf(state.tables.automations), deviceId),
  };
}

const SELECTORS = new Map<string, (state: StoreState) => ButtonView>();

function selectorFor(deviceId: string): (state: StoreState) => ButtonView {
  const known = SELECTORS.get(deviceId);
  if (known !== undefined) {
    return known;
  }
  const selector = memoOnInputs(
    (state) => [state.tables.events, state.tables.automations],
    (state) => viewOf(state, deviceId),
  );
  SELECTORS.set(deviceId, selector);
  return selector;
}

export function useButtonView(deviceId: string): ButtonView {
  return useStoreSelector(selectorFor(deviceId), sameJson);
}
