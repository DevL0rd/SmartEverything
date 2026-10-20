import { use, useEffect, useRef, type RefObject } from 'react';
import type { View } from 'react-native';
import { highlights } from './highlight-anchors';
import { ScreenScrollContext } from './screen-context';

export interface AnchorProps {
  readonly ref: RefObject<View | null>;
  readonly collapsable: false;
}

export function useHighlightAnchor(key: string | null, label: string): AnchorProps {
  const ref = useRef<View>(null);
  const scroll = use(ScreenScrollContext);
  useEffect(() => {
    if (key === null) {
      return undefined;
    }
    return highlights.register({ key, label, ref, scroll });
  }, [key, label, scroll]);
  return { ref, collapsable: false };
}
