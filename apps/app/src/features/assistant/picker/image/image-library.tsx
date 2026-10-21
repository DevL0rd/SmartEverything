import type { ReactNode } from 'react';
import { LibrarySheet } from '../library/library-sheet';
import { ImageLibraryBody } from './image-library-body';

export interface ImageLibraryProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function ImageLibrary({ open, onClose }: ImageLibraryProps): ReactNode {
  return (
    <LibrarySheet open={open} onClose={onClose} title="Image model library" compact>
      {(): ReactNode => <ImageLibraryBody onClose={onClose} />}
    </LibrarySheet>
  );
}
