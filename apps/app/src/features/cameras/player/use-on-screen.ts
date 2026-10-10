import { useCallback, useState } from 'react';
import { useWindowDimensions, type View } from 'react-native';
import { useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useScreen } from '../../../components/screen-context';

export interface OnScreen {
  readonly attach: (node: View | null) => void;
  readonly onLayout: (() => void) | undefined;
  readonly visible: boolean;
}

const SCROLL_STEP = 48;

export function useOnScreen(): OnScreen {
  const [node, attach] = useState<View | null>(null);
  const [visible, setVisible] = useState(true);
  const { width, height } = useWindowDimensions();
  const { scrollY } = useScreen();
  const measure = useCallback((): void => {
    node?.measureInWindow((x, y, w, h) => {
      setVisible(w > 0 && h > 0 && y < height && y + h > 0 && x < width && x + w > 0);
    });
  }, [node, width, height]);
  useAnimatedReaction(
    () => Math.round(scrollY.get() / SCROLL_STEP),
    (step, previous) => {
      if (step !== previous) {
        scheduleOnRN(measure);
      }
    },
    [measure],
  );
  return { attach, onLayout: measure, visible };
}
