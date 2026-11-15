import type { RefObject } from 'react';
import type { TextInput } from 'react-native';
import type { AppHref } from '../../../components/app-href';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import type { PrimaryActionProps } from '../../../components/primary-action';
import type { FileAbilities } from '../source/abilities';
import type { FileOp } from '../source/ops';
import type {
  FileLocation,
  FileNode,
  FilePlace,
  FileSortOrder,
  FileSource,
  FolderListing,
} from '../source/types';
import type { BrowserFilterView } from './browser-filter';
import type { BrowserAction, BrowserStart, BrowserState, BrowserView } from './browser-state';
import type { BarActions, BrowserColumn, RowActions } from './column-model';
import type { DragPayload, DropTarget } from './drag-model';
import type { FilterMatch, FilterMatchOption } from './filter-model';
import type { MenuContext } from './menu-specs';
import type { FileSelection } from './selection-model';
import type { ByName } from './sort-model';
import type { BrowserReveal } from './use-browser-keys';
import type { BodyState } from './view-state-model';

export interface FileBrowserHost<O> {
  readonly hrefOf: (location: FileLocation) => AppHref;
  readonly onOpenFolder: (location: FileLocation) => void;
  readonly onOpenFile?: (node: FileNode<O>) => void;
  readonly byName?: ByName;
  readonly start?: BrowserStart;
  readonly offlineLine?: string | null;
  readonly offlineEmptyLine?: string;
  readonly refusedLine?: string;
  readonly refusedAction?: BrowserLinkAction;
  readonly compact?: boolean;
  readonly placesInFrame?: boolean;
}

export interface BrowserLinkAction {
  readonly label: string;
  readonly href: AppHref;
}

export type BrowserPending<O> =
  | { readonly kind: 'rename'; readonly node: FileNode<O> }
  | { readonly kind: 'newFolder'; readonly in: FileLocation }
  | { readonly kind: 'enterPath' }
  | { readonly kind: 'move' | 'copy' | 'download'; readonly nodes: readonly FileNode<O>[] };

export interface BrowserMatchToggle {
  readonly value: FilterMatch;
  readonly options: readonly FilterMatchOption[];
  readonly onChange: (match: FilterMatch) => void;
}

export interface BrowserSearchSlot {
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly placeholder: string;
  readonly label: string;
  readonly status: string | null;
  readonly match: BrowserMatchToggle | null;
  readonly inputRef: RefObject<TextInput | null>;
}

export interface BrowserHeader {
  readonly title: string;
  readonly subtitle?: string;
  readonly actions: readonly ShellAction[];
  readonly primary?: PrimaryActionProps;
  readonly search: BrowserSearchSlot | null;
}

export interface BrowserCommands<O> {
  readonly press: (node: FileNode<O>) => void;
  readonly pick: (node: FileNode<O>) => void;
  readonly open: (node: FileNode<O>) => void;
  readonly focus: (node: FileNode<O>) => void;
  readonly openLocation: (location: FileLocation) => void;
  readonly menu: (id: string, nodes: readonly FileNode<O>[]) => void;
  readonly run: (op: FileOp<O>) => void;
  readonly upload: () => void;
  readonly newFolder: () => void;
  readonly select: (change: (current: FileSelection) => FileSelection) => void;
  readonly clearSelection: () => void;
  readonly selectAll: () => void;
  readonly setPending: (pending: BrowserPending<O> | null) => void;
  readonly setPanel: (panel: 'details' | 'quickLook', open: boolean) => void;
}

export interface BrowserDrag<O> {
  readonly payloadOf: (node: FileNode<O>) => DragPayload<O>;
  readonly targetOf: (location: FileLocation, key: string, writable: boolean) => DropTarget;
  readonly folderTarget: DropTarget;
}

export interface FileBrowserHandle<O> {
  readonly source: FileSource<O>;
  readonly location: FileLocation;
  readonly host: FileBrowserHost<O>;
  readonly abilities: FileAbilities;
  readonly places: readonly FilePlace[];
  readonly place: FilePlace | null;
  readonly inTrash: boolean;
  readonly offline: boolean;
  readonly listing: FolderListing<O>;
  readonly state: BrowserState;
  readonly sort: FileSortOrder;
  readonly view: BrowserView;
  readonly dispatch: (action: BrowserAction) => void;
  readonly visible: readonly FileNode<O>[];
  readonly total: number | null;
  readonly order: readonly string[];
  readonly picked: readonly FileNode<O>[];
  readonly focused: FileNode<O> | null;
  readonly filter: BrowserFilterView;
  readonly body: BodyState;
  readonly hiddenOnly: boolean;
  readonly writable: boolean;
  readonly columns: readonly BrowserColumn[];
  readonly menuContext: MenuContext;
  readonly rowActions: (node: FileNode<O>) => RowActions;
  readonly barActions: BarActions;
  readonly header: BrowserHeader;
  readonly pending: BrowserPending<O> | null;
  readonly commands: BrowserCommands<O>;
  readonly drag: BrowserDrag<O>;
  readonly reveal: RefObject<BrowserReveal | null>;
}
