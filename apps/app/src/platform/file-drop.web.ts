import { useEffect, useEffectEvent, type RefObject } from 'react';
import { filesOfTransfer, type PickedFile } from './pick-files';

export interface FileDropHandlers {
  readonly onFiles: (files: readonly PickedFile[]) => void;
  readonly onHover: (hovering: boolean) => void;
}

function elementOf(target: RefObject<unknown>): HTMLElement | null {
  return target.current instanceof HTMLElement ? target.current : null;
}

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') === true;
}

export function useFileDrop(target: RefObject<unknown>, handlers: FileDropHandlers): void {
  const onFiles = useEffectEvent(handlers.onFiles);
  const onHover = useEffectEvent(handlers.onHover);
  useEffect(() => {
    const element = elementOf(target);
    if (element === null) {
      return undefined;
    }
    let depth = 0;
    const enter = (event: DragEvent): void => {
      if (carriesFiles(event)) {
        event.preventDefault();
        depth += 1;
        onHover(true);
      }
    };
    const over = (event: DragEvent): void => {
      if (carriesFiles(event)) {
        event.preventDefault();
      }
    };
    const leave = (): void => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        onHover(false);
      }
    };
    const drop = (event: DragEvent): void => {
      event.preventDefault();
      depth = 0;
      onHover(false);
      onFiles(filesOfTransfer(event.dataTransfer));
    };
    element.addEventListener('dragenter', enter);
    element.addEventListener('dragover', over);
    element.addEventListener('dragleave', leave);
    element.addEventListener('drop', drop);
    return (): void => {
      element.removeEventListener('dragenter', enter);
      element.removeEventListener('dragover', over);
      element.removeEventListener('dragleave', leave);
      element.removeEventListener('drop', drop);
    };
  }, [target]);
}

export function useFilePaste(
  target: RefObject<unknown>,
  onFiles: FileDropHandlers['onFiles'],
): void {
  const deliver = useEffectEvent(onFiles);
  useEffect(() => {
    const element = elementOf(target);
    if (element === null) {
      return undefined;
    }
    const paste = (event: ClipboardEvent): void => {
      const files = filesOfTransfer(event.clipboardData);
      if (files.length > 0) {
        event.preventDefault();
        deliver(files);
      }
    };
    element.addEventListener('paste', paste);
    return (): void => {
      element.removeEventListener('paste', paste);
    };
  }, [target]);
}
