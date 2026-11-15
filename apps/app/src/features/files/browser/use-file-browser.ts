import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import { useIsFocused } from 'expo-router';
import type { HeaderAction } from '../../../components/page-header';
import { isNative } from '../../../design/platform';
import { useSyncStatus } from '../../../store/selectors';
import { offlineOf, type FileAbilities } from '../source/abilities';
import { keysOf } from '../source/node';
import type { FileLocation, FileNode, FilePlace, FileSource } from '../source/types';
import type { DragPayload } from './drag-model';
import { chooseUploads, runMenuAction, runOp, type MenuTargets } from './browser-commands';
import { useBrowserFilter, type FilteredNodes } from './browser-filter';
import { useBrowserState, type BrowserStateHandle } from './browser-state';
import type {
  BrowserCommands,
  BrowserDrag,
  BrowserHeader,
  BrowserPending,
  BrowserSearchSlot,
  FileBrowserHandle,
  FileBrowserHost,
} from './browser-types';
import { columnsOf, hasPeople, rowActionsOf, selectionActionsOf } from './column-model';
import { AREA_LABEL, headerModelOf, inTrashOf, readOnlyPlace } from './header-model';
import { browserKeyFor, isEditable } from './keys-model';
import { shownNodes, typedCharOf } from './filter-model';
import type { AreaAction } from './menu-specs';
import {
  focusedOf,
  keptIn,
  pickedOf,
  pressModeOf,
  selectAllOf,
  tapModeOf,
  tapped,
} from './selection-model';
import { useBrowserKeys, useShiftHeld, type BrowserReveal } from './use-browser-keys';
import { bodyStateOf, type BodyState } from './view-state-model';

export interface FileBrowserInput<O> {
  readonly source: FileSource<O>;
  readonly location: FileLocation;
  readonly host: FileBrowserHost<O>;
}

interface Core<O> {
  readonly input: FileBrowserInput<O>;
  readonly abilities: FileAbilities;
  readonly places: readonly FilePlace[];
  readonly place: FilePlace | null;
  readonly offline: boolean;
  readonly browser: BrowserStateHandle;
  readonly listing: ReturnType<FileSource<O>['useFolder']>;
  readonly filtered: FilteredNodes<O>;
}

function useCore<O>(input: FileBrowserInput<O>): Core<O> {
  const { source, location, host } = input;
  const appOffline = useSyncStatus().status !== 'live';
  const offline = appOffline || (host.offlineLine ?? null) !== null;
  const raw = source.useAbilities(location);
  const abilities = offline ? offlineOf(raw) : raw;
  const places = source.usePlaces();
  const place = places.find((candidate) => candidate.key === location.place) ?? null;
  const browser = useBrowserState(location, abilities, host.start);
  const listing = source.useFolder(location, browser.sort);
  const filtered = useBrowserFilter({
    source,
    location,
    abilities,
    listing,
    filter: browser.state.filter,
    showHidden: browser.state.showHidden,
    dispatch: browser.dispatch,
  });
  return { input, abilities, places, place, offline, browser, listing, filtered };
}

function presentNames<O>(core: Core<O>): ReadonlySet<string> {
  return new Set(core.listing.entries.map((node) => node.name));
}

function searchSlotOf<O>(core: Core<O>): BrowserSearchSlot | null {
  const { abilities, filtered } = core;
  if (!abilities.list) return null;
  const { filter } = filtered;
  return {
    value: filter.text,
    onChange: filter.setText,
    placeholder: abilities.searchContents ? 'Filter by name or text inside' : 'Filter this folder',
    label: `Filter ${core.place?.label ?? core.input.source.label}`,
    status: filter.countLabel,
    match:
      filter.matchOptions.length === 0
        ? null
        : { value: filter.match, options: filter.matchOptions, onChange: filter.setMatch },
    inputRef: filter.inputRef,
  };
}

function shownTotalOf<O>(core: Pick<Core<O>, 'listing' | 'abilities' | 'browser'>): number | null {
  const { listing, abilities } = core;
  if (!listing.complete) return listing.total;
  return shownNodes(listing.entries, core.browser.state.showHidden || !abilities.hidden).length;
}

function headerOf<O>(core: Core<O>, area: (action: AreaAction) => () => void): BrowserHeader {
  const model = headerModelOf({
    sourceLabel: core.input.source.label,
    place: core.place,
    folder: core.listing.folder,
    crumbs: core.listing.crumbs,
    total: shownTotalOf(core),
    abilities: core.abilities,
    offline: core.offline,
  });
  const picking = pickedOf(core.filtered.visible, core.browser.state.selection).length > 0;
  const { primary, secondary } = picking ? { primary: null, secondary: [] } : model.area;
  const actions: readonly HeaderAction[] = secondary.map((action) => ({
    icon: action === 'upload' ? 'upload' : 'plus',
    label: AREA_LABEL[action],
    onPress: area(action),
  }));
  return {
    title: model.title,
    ...(model.subtitle === null ? {} : { subtitle: model.subtitle }),
    actions,
    ...(primary === null
      ? {}
      : {
          primary: {
            label: AREA_LABEL[primary],
            icon: primary === 'upload' ? 'upload' : 'plus',
            onPress: area(primary),
          },
        }),
    search: searchSlotOf(core),
  };
}

function folderLocationOf<O>(core: Core<O>, node: FileNode<O>): FileLocation {
  return { place: core.input.location.place, folder: node.key };
}

interface Panels<O> {
  readonly pending: BrowserPending<O> | null;
  readonly setPending: (pending: BrowserPending<O> | null) => void;
}

function focuserOf<O>(core: Core<O>): (node: FileNode<O>) => void {
  return (node) => {
    core.browser.dispatch({ kind: 'focus', key: node.key });
  };
}

function targetsOf<O>(
  core: Core<O>,
  panels: Panels<O>,
  open: (node: FileNode<O>) => void,
): MenuTargets<O> {
  const { dispatch } = core.browser;
  const focus = focuserOf(core);
  return {
    open,
    quickLook: (node): void => {
      focus(node);
      dispatch({ kind: 'panel', panel: 'quickLook', open: true });
    },
    details: (node): void => {
      focus(node);
      dispatch({ kind: 'panel', panel: 'details', open: true });
    },
    rename: (node): void => {
      panels.setPending({ kind: 'rename', node });
    },
    transfer: (kind, nodes): void => {
      panels.setPending({ kind, nodes });
    },
  };
}

function openerOf<O>(core: Core<O>, panels: Panels<O>): (node: FileNode<O>) => void {
  const { host } = core.input;
  const open = (node: FileNode<O>): void => {
    const target = core.input.source.openTargetOf?.(node) ?? node;
    if (target.kind === 'folder') {
      host.onOpenFolder(folderLocationOf(core, target));
      return;
    }
    if (host.onOpenFile !== undefined) {
      host.onOpenFile(target);
      return;
    }
    const targets = targetsOf(core, panels, open);
    if (core.abilities.quickLook.includes(node.kind)) targets.quickLook(node);
    else if (core.abilities.details) targets.details(node);
  };
  return open;
}

function commandsOf<O>(
  core: Core<O>,
  panels: Panels<O>,
  shiftHeld: () => boolean,
): BrowserCommands<O> {
  const { dispatch, state } = core.browser;
  const order = keysOf(core.filtered.visible);
  const open = openerOf(core, panels);
  const select: BrowserCommands<O>['select'] = (change) => {
    dispatch({ kind: 'select', change });
  };
  const pick = (node: FileNode<O>): void => {
    const mode = tapModeOf({ shift: shiftHeld(), toggle: true, selecting: state.selecting });
    dispatch({ kind: 'selecting', on: true });
    select((current) => tapped(keptIn(current, order), order, node.key, mode));
  };
  return {
    press: (node): void => {
      if (pressModeOf(core.filtered.visible, state.selection, shiftHeld()) === 'pick') pick(node);
      else open(node);
    },
    pick,
    open,
    focus: focuserOf(core),
    openLocation: core.input.host.onOpenFolder,
    menu: (id, nodes): void => {
      runMenuAction(id, nodes, core.input.source, targetsOf(core, panels, open));
    },
    run: (op): void => {
      runOp(core.input.source, op);
    },
    upload: (): void => {
      chooseUploads(core.input.source, core.input.location, presentNames(core));
    },
    newFolder: (): void => {
      panels.setPending({ kind: 'newFolder', in: core.input.location });
    },
    select,
    clearSelection: (): void => {
      dispatch({ kind: 'selecting', on: false });
    },
    selectAll: (): void => {
      select(() => selectAllOf(order));
    },
    setPending: panels.setPending,
    setPanel: (panel, isOpen): void => {
      dispatch({ kind: 'panel', panel, open: isOpen });
    },
  };
}

function dragOf<O>(core: Core<O>): BrowserDrag<O> {
  const { source, location } = core.input;
  const ancestors = core.listing.crumbs.map((crumb) => crumb.location.folder ?? crumb.key);
  const here = location.folder ?? location.place;
  const writable = !readOnlyPlace(core.abilities, core.listing.folder);
  const targetOf: BrowserDrag<O>['targetOf'] = (target, key, isWritable) => ({
    sourceId: source.id,
    location: target,
    key,
    ancestors: key === here ? ancestors.filter((entry) => entry !== here) : ancestors,
    writable: isWritable,
  });
  return {
    payloadOf: (node): DragPayload<O> => {
      const picked = pickedOf(core.filtered.visible, core.browser.state.selection);
      const nodes = picked.some((entry) => entry.key === node.key) ? picked : [node];
      return { sourceId: source.id, nodes };
    },
    targetOf,
    folderTarget: targetOf(location, here, writable),
  };
}

function useTypeToFilter<O>(core: Core<O>, enabled: boolean): void {
  const { filter } = core.filtered;
  const typed = useEffectEvent((char: string) => {
    filter.setText(filter.text + char);
    filter.focus();
  });
  useEffect(() => {
    if (!enabled || isNative()) return undefined;
    const listen = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      const editable = isEditable(event.target);
      const char = typedCharOf(event, browserKeyFor(event, editable) !== null, editable);
      if (char === null) return;
      event.preventDefault();
      typed(char);
    };
    globalThis.addEventListener('keydown', listen);
    return (): void => {
      globalThis.removeEventListener('keydown', listen);
    };
  }, [enabled]);
}

function useKeys<O>(handle: FileBrowserHandle<O>, enabled: boolean): void {
  const { commands, state, abilities, picked } = handle;
  const canTrash = abilities.trash && !handle.inTrash;
  useBrowserKeys(
    {
      order: handle.order,
      grid: handle.view === 'cards',
      focused: handle.focused,
      picked,
      selection: state.selection,
      setSelection: commands.select,
      reveal: handle.reveal,
      open: commands.open,
      trash: canTrash
        ? (nodes): void => {
            commands.run({ kind: 'trash', nodes });
          }
        : null,
      focusFilter: handle.filter.focus,
      slots: { details: abilities.details, quickLook: abilities.quickLook.length > 0 },
      panels: {
        details: state.panels.has('details'),
        quickLook: state.panels.has('quickLook'),
        setDetails: (open) => {
          commands.setPanel('details', open);
        },
        setQuickLook: (open) => {
          commands.setPanel('quickLook', open);
        },
        setRenaming: abilities.rename
          ? (node): void => {
              commands.setPending(node === null ? null : { kind: 'rename', node });
            }
          : null,
      },
    },
    enabled,
  );
}

function bodyOf<O>(core: Core<O>): BodyState {
  const { abilities, listing, filtered } = core;
  return bodyStateOf({
    abilities,
    loading: listing.loading,
    error: listing.error,
    offline: core.offline,
    loaded: listing.entries.length,
    visible: filtered.visible.length,
    filtering: filtered.filter.active,
    search: filtered.filter.search,
    kind: core.browser.state.filter.kind,
  });
}

function handleOf<O>(
  core: Core<O>,
  panels: Panels<O>,
  shiftHeld: () => boolean,
): Omit<FileBrowserHandle<O>, 'reveal'> {
  const { abilities, listing, filtered, browser, place } = core;
  const inTrash = inTrashOf(place);
  const menuContext = { abilities, inTrash };
  const commands = commandsOf(core, panels, shiftHeld);
  const picked = pickedOf(filtered.visible, browser.state.selection);
  const actions = (nodes: readonly FileNode<O>[]): ReturnType<FileSource<O>['actions']> =>
    core.input.source.actions(nodes);
  return {
    source: core.input.source,
    location: core.input.location,
    host: core.input.host,
    abilities,
    places: core.places,
    place,
    inTrash,
    offline: core.offline,
    listing,
    state: browser.state,
    sort: browser.sort,
    view: browser.view,
    dispatch: browser.dispatch,
    visible: filtered.visible,
    total: shownTotalOf(core),
    order: keysOf(filtered.visible),
    picked,
    focused: focusedOf(filtered.visible, browser.state.selection),
    filter: filtered.filter,
    hiddenOnly: filtered.hiddenOnly,
    writable: !readOnlyPlace(abilities, listing.folder) && !core.offline,
    body: bodyOf(core),
    columns: columnsOf(abilities, hasPeople(abilities, listing.entries)),
    menuContext,
    rowActions: (node) => rowActionsOf(node, menuContext, inTrash ? [] : actions([node])),
    barActions: selectionActionsOf(picked, menuContext, picked.length === 0 ? [] : actions(picked)),
    header: headerOf(core, (action) =>
      action === 'upload' ? commands.upload : commands.newFolder,
    ),
    pending: panels.pending,
    commands,
    drag: dragOf(core),
  };
}

function useRevealRef(): RefObject<BrowserReveal | null> {
  return useRef<BrowserReveal>(null);
}

export function useFileBrowser<O>(input: FileBrowserInput<O>): FileBrowserHandle<O> {
  const core = useCore(input);
  const [pending, setPending] = useState<BrowserPending<O> | null>(null);
  const shiftHeld = useShiftHeld();
  const reveal = useRevealRef();
  const handle = { ...handleOf(core, { pending, setPending }, shiftHeld), reveal };
  const enabled =
    useIsFocused() && input.host.compact !== true && core.abilities.list && pending === null;
  useKeys(handle, enabled);
  useTypeToFilter(core, enabled);
  return handle;
}
