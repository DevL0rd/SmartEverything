import { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { keyPressOf, type KeyPress } from '../../../design/keyboard';
import { isNative } from '../../../design/platform';

export function useDocumentKeys(enabled: boolean, handle: (input: KeyPress) => boolean): void {
  useEffect(() => {
    if (!enabled || isNative()) {
      return undefined;
    }
    const listen = (event: KeyboardEvent): void => {
      if (handle(keyPressOf(event))) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, [enabled, handle]);
}

export function useBackPress(enabled: boolean, handle: () => boolean): void {
  useEffect(() => {
    if (!enabled || !isNative()) {
      return undefined;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', handle);
    return (): void => {
      subscription.remove();
    };
  }, [enabled, handle]);
}
