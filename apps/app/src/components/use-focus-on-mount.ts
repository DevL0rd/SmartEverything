import { useEffect, useRef, type RefObject } from 'react';
import type { TextInput } from 'react-native';

export function useFocusOnMount(
  enabled: boolean,
  external?: RefObject<TextInput | null>,
): RefObject<TextInput | null> {
  const own = useRef<TextInput>(null);
  const ref = external ?? own;
  useEffect(() => {
    if (enabled) {
      ref.current?.focus();
    }
  }, [enabled, ref]);
  return ref;
}
