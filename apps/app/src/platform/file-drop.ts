import type { RefObject } from 'react';
import type { PickedFile } from './pick-files';

export interface FileDropHandlers {
  readonly onFiles: (files: readonly PickedFile[]) => void;
  readonly onHover: (hovering: boolean) => void;
}

export function useFileDrop(_target: RefObject<unknown>, _handlers: FileDropHandlers): void {
  return undefined;
}

export function useFilePaste(
  _target: RefObject<unknown>,
  _onFiles: FileDropHandlers['onFiles'],
): void {
  return undefined;
}
