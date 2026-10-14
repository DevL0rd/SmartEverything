import type { PressableProps } from 'react-native';
import { isNative } from '../design/platform';

function suppressReleaseClick(): void {
  const clear = (): void => {
    document.removeEventListener('click', suppress, true);
    document.removeEventListener('pointerdown', clear, true);
    document.removeEventListener('pointercancel', clear, true);
    document.removeEventListener('keydown', clear, true);
    window.removeEventListener('blur', clear);
  };
  const suppress = (event: MouseEvent): void => {
    if (event.detail === 0) {
      return;
    }
    clear();
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  document.addEventListener('click', suppress, true);
  document.addEventListener('pointerdown', clear, true);
  document.addEventListener('pointercancel', clear, true);
  document.addEventListener('keydown', clear, true);
  window.addEventListener('blur', clear);
}

export function longPressHandler(
  handler: PressableProps['onLongPress'],
): PressableProps['onLongPress'] {
  if (handler === undefined || handler === null || isNative()) {
    return handler;
  }
  return (event): void => {
    suppressReleaseClick();
    handler(event);
  };
}
