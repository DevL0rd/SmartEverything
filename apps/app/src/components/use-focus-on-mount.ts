import { useEffect, useRef, type RefObject } from 'react';
import type { TextInput } from 'react-native';

export function useFocusOnMount(enabled: boolean): RefObject<TextInput | null> {
  const ref = useRef<TextInput>(null);
  useEffect(() => {
    if (enabled) {
      ref.current?.focus();
    }
  }, [enabled]);
  return ref;
}
