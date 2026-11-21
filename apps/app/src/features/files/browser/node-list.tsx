import { use, type ReactNode } from 'react';
import { View } from 'react-native';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { useIdiom } from '../../../design/platform';
import type { FileAbilities } from '../source/abilities';
import type {
  FileLocation,
  FileNode,
  FilePlace,
  FileSearch,
  FileSource,
  FolderListing,
} from '../source/types';
import { useBrowserPanels } from './browser-panels';
import type { FileBrowserHandle, FileBrowserHost } from './browser-types';
import { layoutOf } from './column-model';
import { BrowserSelection } from './selection';
import { useFileBrowser } from './use-file-browser';
import { DockedContext } from './docked-context';

export interface NodeListInput<O> {
  readonly source: FileSource<O>;
  readonly list: string;
  readonly place: FilePlace | null;
  readonly nodes: readonly FileNode<O>[];
  readonly abilities: FileAbilities;
  readonly host: Pick<FileBrowserHost<O>, 'hrefOf' | 'onOpenFolder' | 'byName' | 'onOpenFile'>;
}

const NO_PLACES: readonly FilePlace[] = [];

function noSearch<O>(): FileSearch<O> {
  return { matches: [], scanned: null, running: false, error: null, more: null, stop: null };
}

function settledListing<O>(nodes: readonly FileNode<O>[]): FolderListing<O> {
  return {
    entries: nodes,
    folder: null,
    crumbs: [],
    total: nodes.length,
    complete: true,
    loading: false,
    stale: false,
    error: null,
    more: null,
    retry: () => undefined,
  };
}

export function listSourceOf<O>(
  source: FileSource<O>,
  input: Pick<NodeListInput<O>, 'nodes' | 'abilities' | 'place'>,
): FileSource<O> {
  const listing = settledListing(input.nodes);
  const places = input.place === null ? NO_PLACES : [input.place];
  return {
    ...source,
    useAbilities: () => input.abilities,
    usePlaces: () => places,
    useFolder: () => listing,
    useSearch: noSearch,
  };
}

export function useNodeList<O>(input: NodeListInput<O>): FileBrowserHandle<O> {
  const location: FileLocation = { place: input.list, folder: null };
  return useFileBrowser({
    source: listSourceOf(input.source, input),
    location,
    host: { ...input.host, compact: true },
  });
}

class NoNodeListFrameError extends Error {
  override readonly name = 'NoNodeListFrameError';
  constructor() {
    super('useSelectionDocked is used outside a NodeListFrame.');
  }
}

export function useSelectionDocked(): boolean {
  const docked = use(DockedContext);
  if (docked === null) throw new NoNodeListFrameError();
  return docked;
}

export type SelectionPlace = 'top' | 'inline';

export function NodeListFrame<O>({
  browser,
  from,
  selection,
  children,
}: {
  readonly browser: FileBrowserHandle<O>;
  readonly from: string;
  readonly selection: SelectionPlace;
  readonly children: ReactNode;
}): ReactNode {
  const slots = useBrowserPanels(browser, { from });
  const measured = useMeasuredWidth();
  const docked = useIdiom() === 'touch' || layoutOf(measured.width, false) !== 'table';
  const { panels } = browser.state;
  return (
    <View onLayout={measured.onLayout} className="min-h-0 flex-1 gap-3">
      {docked || selection === 'inline' ? null : (
        <BrowserSelection browser={browser} docked={false} />
      )}
      <View className="min-h-0 flex-1 flex-row gap-4">
        <View className="min-h-0 min-w-0 flex-1">
          <DockedContext value={docked}>{children}</DockedContext>
        </View>
        {panels.has('details') ? slots.details : null}
      </View>
      {docked ? <BrowserSelection browser={browser} docked /> : null}
      {panels.has('quickLook') ? slots.quickLook : null}
      {slots.sheets}
    </View>
  );
}
