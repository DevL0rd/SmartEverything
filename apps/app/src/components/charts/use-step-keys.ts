import { useCallback, type RefCallback } from 'react';
import { Platform, type View } from 'react-native';

export interface StepKeys {
  readonly ref: RefCallback<View>;
  readonly tabIndex: 0;
}

const FORWARD = new Set(['ArrowRight', 'ArrowDown']);
const BACKWARD = new Set(['ArrowLeft', 'ArrowUp']);

export function useStepKeys(step: (direction: 1 | -1) => void, clear: () => void): StepKeys {
  const ref = useCallback<RefCallback<View>>(
    (node) => {
      if (Platform.OS !== 'web' || !(node instanceof HTMLElement)) {
        return undefined;
      }
      const listen = (event: KeyboardEvent): void => {
        if (FORWARD.has(event.key)) {
          step(1);
        } else if (BACKWARD.has(event.key)) {
          step(-1);
        } else if (event.key === 'Escape') {
          clear();
        } else {
          return;
        }
        event.preventDefault();
      };
      node.addEventListener('keydown', listen);
      return (): void => {
        node.removeEventListener('keydown', listen);
      };
    },
    [step, clear],
  );
  return { ref, tabIndex: 0 };
}
