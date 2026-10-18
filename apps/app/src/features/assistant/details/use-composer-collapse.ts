import { useEffect } from 'react';
import { Keyboard } from 'react-native';
import { isNative, useIdiom } from '../../../design/platform';

export function useComposerCollapse(open: boolean, collapse: () => void): () => void {
  const touch = useIdiom() === 'touch' && isNative();
  useEffect(() => {
    if (open && touch) {
      Keyboard.dismiss();
    }
  }, [open, touch]);
  return (): void => {
    if (open && touch) {
      collapse();
    }
  };
}
