import { memoOnInputs } from '../../../store/memo-selector';
import { sameJson } from '../../../store/same-json';
import { deviceOf, rowsOf, type StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { hubViewOf, type HubView } from './hub-model';

const SELECTORS = new Map<string, (state: StoreState) => HubView>();

function selectorFor(hubId: string): (state: StoreState) => HubView {
  const known = SELECTORS.get(hubId);
  if (known !== undefined) {
    return known;
  }
  const selector = memoOnInputs(
    (state) => [state.tables.devices],
    (state) => hubViewOf(rowsOf(state.tables.devices).map(deviceOf), hubId),
  );
  SELECTORS.set(hubId, selector);
  return selector;
}

export function useHubView(hubId: string): HubView {
  return useStoreSelector(selectorFor(hubId), sameJson);
}
