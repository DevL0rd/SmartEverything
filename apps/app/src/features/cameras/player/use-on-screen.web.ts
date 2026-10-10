import { useEffect, useState } from 'react';
import type { View } from 'react-native';

export interface OnScreen {
  readonly attach: (node: View | null) => void;
  readonly onLayout: (() => void) | undefined;
  readonly visible: boolean;
}

export function useOnScreen(): OnScreen {
  const [node, attach] = useState<View | null>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!(node instanceof Element)) {
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      const last = entries.at(-1);
      if (last !== undefined) {
        setVisible(last.isIntersecting);
      }
    });
    observer.observe(node);
    return (): void => {
      observer.disconnect();
    };
  }, [node]);
  return { attach, onLayout: undefined, visible };
}
