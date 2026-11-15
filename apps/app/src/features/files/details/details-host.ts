import type { FileAbilities } from '../source/abilities';
import type { FileNode, FileSource } from '../source/types';

export type DetailsAct = 'star' | 'unstar' | 'trash';

export interface DetailsHost<O> {
  readonly source: FileSource<O>;
  readonly abilities: FileAbilities;
  readonly act: (action: DetailsAct, nodes: readonly FileNode<O>[]) => void;
  readonly quickLook: ((node: FileNode<O>) => void) | null;
  readonly close: () => void;
}

export interface DetailsProps<O> {
  readonly node: FileNode<O>;
  readonly host: DetailsHost<O>;
}
