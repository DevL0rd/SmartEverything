import type { ReactNode } from 'react';
import { FilePickerSheet } from '../picker/file-picker-sheet';
import type { FileOp } from '../source/ops';
import type { FileLocation, FileNode, FileSource } from '../source/types';
import {
  transferOpOf,
  transferRefusalOf,
  transferTitleOf,
  type TransferMode,
} from './transfer-model';

export interface TransferSheetProps<O> {
  readonly source: FileSource<O>;
  readonly mode: TransferMode;
  readonly nodes: readonly FileNode<O>[];
  readonly start: FileLocation;
  readonly onRun: (op: FileOp<O>) => void;
  readonly onClose: () => void;
}

export function TransferSheet<O>(props: TransferSheetProps<O>): ReactNode {
  const { source, mode, nodes, onRun } = props;
  return (
    <FilePickerSheet
      open
      source={source}
      mode="folder"
      writableOnly
      start={props.start}
      title={transferTitleOf(mode, nodes)}
      refusalOf={(here) => transferRefusalOf(source.id, mode, nodes, here)}
      onClose={props.onClose}
      onChoose={(choice) => {
        if (choice.kind !== 'folder') return;
        onRun(transferOpOf(mode, nodes, choice.location));
      }}
    />
  );
}
