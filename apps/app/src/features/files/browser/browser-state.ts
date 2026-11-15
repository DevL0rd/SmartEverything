import { useReducer } from 'react';
import type { FileAbilities } from '../source/abilities';
import { locationKeyOf, type FileLocation, type FileSortOrder } from '../source/types';
import type { FilterMatch, KindFilter } from './filter-model';
import { NO_SELECTION, focusOn, keptIn, type FileSelection } from './selection-model';
import { DEFAULT_SORT, sortWithin } from './sort-model';

export type BrowserView = 'list' | 'cards';

export type BrowserPanel = 'details' | 'quickLook';

export interface BrowserFilter {
  readonly text: string;
  readonly match: FilterMatch;
  readonly kind: KindFilter;
}

export const NO_FILTER: BrowserFilter = { text: '', match: 'names', kind: 'all' };

export interface BrowserState {
  readonly at: string;
  readonly sort: FileSortOrder;
  readonly view: BrowserView;
  readonly showHidden: boolean;
  readonly filter: BrowserFilter;
  readonly selection: FileSelection;
  readonly selecting: boolean;
  readonly panels: ReadonlySet<BrowserPanel>;
}

export type BrowserAction =
  | { readonly kind: 'sort'; readonly sort: FileSortOrder }
  | { readonly kind: 'view'; readonly view: BrowserView }
  | { readonly kind: 'showHidden'; readonly show: boolean }
  | { readonly kind: 'filter'; readonly change: Partial<BrowserFilter> }
  | { readonly kind: 'clearFilter' }
  | { readonly kind: 'select'; readonly change: (current: FileSelection) => FileSelection }
  | { readonly kind: 'focus'; readonly key: string }
  | { readonly kind: 'keep'; readonly order: readonly string[] }
  | { readonly kind: 'selecting'; readonly on: boolean }
  | { readonly kind: 'panel'; readonly panel: BrowserPanel; readonly open: boolean };

export interface BrowserStart {
  readonly sort?: FileSortOrder;
  readonly view?: BrowserView;
  readonly showHidden?: boolean;
}

export function initialStateOf(location: FileLocation, start: BrowserStart = {}): BrowserState {
  return {
    at: locationKeyOf(location),
    sort: start.sort ?? DEFAULT_SORT,
    view: start.view ?? 'list',
    showHidden: start.showHidden ?? false,
    filter: NO_FILTER,
    selection: NO_SELECTION,
    selecting: false,
    panels: new Set(),
  };
}

export function arrive(state: BrowserState, at: string): BrowserState {
  if (state.at === at) return state;
  return {
    ...state,
    at,
    filter: NO_FILTER,
    selection: NO_SELECTION,
    selecting: false,
    panels: new Set([...state.panels].filter((panel) => panel === 'details')),
  };
}

function withPanel(
  panels: ReadonlySet<BrowserPanel>,
  panel: BrowserPanel,
  open: boolean,
): ReadonlySet<BrowserPanel> {
  const next = new Set(panels);
  if (open) {
    next.add(panel);
  } else {
    next.delete(panel);
  }
  return next;
}

function withSelection(state: BrowserState, selection: FileSelection): BrowserState {
  if (selection === state.selection) return state;
  const selecting = state.selecting && selection.keys.size > 0;
  return { ...state, selection, selecting };
}

type SelectionAction = Extract<
  BrowserAction,
  { readonly kind: 'select' | 'focus' | 'keep' | 'selecting' }
>;

const SELECTION_KINDS: ReadonlySet<BrowserAction['kind']> = new Set([
  'select',
  'focus',
  'keep',
  'selecting',
]);

function isSelectionAction(action: BrowserAction): action is SelectionAction {
  return SELECTION_KINDS.has(action.kind);
}

function applySelection(state: BrowserState, action: SelectionAction): BrowserState {
  switch (action.kind) {
    case 'select':
      return withSelection(state, action.change(state.selection));
    case 'focus':
      return withSelection(state, focusOn(state.selection, action.key));
    case 'keep':
      return withSelection(state, keptIn(state.selection, action.order));
    case 'selecting':
      return {
        ...state,
        selecting: action.on,
        selection: action.on ? state.selection : NO_SELECTION,
      };
  }
}

function apply(state: BrowserState, action: BrowserAction): BrowserState {
  if (isSelectionAction(action)) return applySelection(state, action);
  switch (action.kind) {
    case 'sort':
      return { ...state, sort: action.sort };
    case 'view':
      return { ...state, view: action.view };
    case 'showHidden':
      return { ...state, showHidden: action.show };
    case 'filter':
      return { ...state, filter: { ...state.filter, ...action.change } };
    case 'clearFilter':
      return { ...state, filter: NO_FILTER };
    case 'panel':
      return { ...state, panels: withPanel(state.panels, action.panel, action.open) };
  }
}

export interface LocatedAction {
  readonly at: string;
  readonly action: BrowserAction;
}

export function reduceBrowser(state: BrowserState, { at, action }: LocatedAction): BrowserState {
  return apply(arrive(state, at), action);
}

export interface BrowserStateHandle {
  readonly state: BrowserState;
  readonly sort: FileSortOrder;
  readonly view: BrowserView;
  readonly dispatch: (action: BrowserAction) => void;
}

export function useBrowserState(
  location: FileLocation,
  abilities: FileAbilities,
  start: BrowserStart = {},
): BrowserStateHandle {
  const at = locationKeyOf(location);
  const [stored, dispatchAt] = useReducer(reduceBrowser, location, (first) =>
    initialStateOf(first, start),
  );
  const state = arrive(stored, at);
  return {
    state,
    sort: sortWithin(state.sort, abilities),
    view: abilities.grid ? state.view : 'list',
    dispatch: (action): void => {
      dispatchAt({ at, action });
    },
  };
}
