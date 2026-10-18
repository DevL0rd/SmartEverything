import { memoOnInputs } from '../../../store/memo-selector';
import { rowsOf, type StoreState } from '../../../store/state';
import { sameJson } from '../../../store/same-json';
import { useStoreSelector } from '../../../store/store-context';
import { cycleViewOf, type CycleView } from './cycles';

const SELECTORS = new Map<string, (state: StoreState) => CycleView>();

function selectorFor(deviceId: string): (state: StoreState) => CycleView {
  const known = SELECTORS.get(deviceId);
  if (known !== undefined) {
    return known;
  }
  const selector = memoOnInputs(
    (state) => [state.tables.events],
    (state) => cycleViewOf(rowsOf(state.tables.events).filter((row) => row.device_id === deviceId)),
  );
  SELECTORS.set(deviceId, selector);
  return selector;
}

export function useCycles(deviceId: string): CycleView {
  return useStoreSelector(selectorFor(deviceId), sameJson);
}
