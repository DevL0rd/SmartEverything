import { useEffect, useRef, type RefObject } from 'react';
import type { View } from 'react-native';
import { focusInto } from '../../../../design/focus-into';

export function useFocusFirst(): RefObject<View | null> {
  const ref = useRef<View>(null);
  useEffect(() => {
    focusInto(ref.current);
  }, []);
  return ref;
}
