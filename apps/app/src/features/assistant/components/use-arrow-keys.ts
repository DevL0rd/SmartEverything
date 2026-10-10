import { useEffect } from 'react';
import { isNative } from '../../../design/platform';

export function useArrowKeys(active: boolean, onPrevious: () => void, onNext: () => void): void {
  useEffect(() => {
    if (!active || isNative()) {
      return undefined;
    }
    const listen = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowLeft') {
        onPrevious();
      } else if (event.key === 'ArrowRight') {
        onNext();
      }
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, [active, onPrevious, onNext]);
}
