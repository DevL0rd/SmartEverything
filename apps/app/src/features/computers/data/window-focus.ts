import { isNative } from '../../../design/platform';

export function onWindowFocus(listener: () => void): () => void {
  if (isNative()) return (): void => undefined;
  window.addEventListener('focus', listener);
  return (): void => {
    window.removeEventListener('focus', listener);
  };
}
