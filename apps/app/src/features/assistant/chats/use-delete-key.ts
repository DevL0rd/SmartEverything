import { useEffect } from 'react';
import { isNative } from '../../../design/platform';

function isTextEntry(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function insideList(rowDomId: string, target: EventTarget | null): boolean {
  const list = document.getElementById(rowDomId)?.closest('[role="listbox"]');
  return target instanceof Node && list?.contains(target) === true;
}

export function useDeleteKey(
  highlighted: boolean,
  rowDomId: string,
  onDelete: (() => void) | undefined,
): void {
  useEffect(() => {
    if (!highlighted || onDelete === undefined || isNative()) {
      return undefined;
    }
    const listen = (event: KeyboardEvent): void => {
      if (
        event.key !== 'Delete' ||
        isTextEntry(event.target) ||
        !insideList(rowDomId, event.target)
      ) {
        return;
      }
      event.preventDefault();
      onDelete();
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, [highlighted, rowDomId, onDelete]);
}
