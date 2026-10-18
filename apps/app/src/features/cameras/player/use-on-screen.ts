import { useMemo, useState } from 'react';
import type { View } from 'react-native';
import { useOnScreen as useVisualOnScreen } from '../../../design/visibility';
import type { ViewportVisibility } from '../../../design/viewport';

export interface OnScreen extends ViewportVisibility {
  readonly attach: (node: View | null) => void;
}

export function useOnScreen(): OnScreen {
  const [node, attach] = useState<View | null>(null);
  const ref = useMemo(() => ({ current: node }), [node]);
  return { attach, ...useVisualOnScreen(ref, 0) };
}
