import { useEffect } from 'react';
import { isNative } from '../../../../design/platform';
import { isEditableTarget } from '../canvas/shortcuts';
import { editorKeyFor, type EditorKey } from './editor-keys';

export function useEditorKeys(run: (key: EditorKey) => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled || isNative()) return undefined;
    const listen = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      const key = editorKeyFor(event, isEditableTarget(event.target));
      if (key === null) return;
      event.preventDefault();
      run(key);
    };
    globalThis.addEventListener('keydown', listen);
    return (): void => {
      globalThis.removeEventListener('keydown', listen);
    };
  }, [enabled, run]);
}
