import { useRef, type ReactNode } from 'react';
import type { View } from 'react-native';
import { useVisibleLive } from '../../design/use-visible-live';
import type { WideFrame } from '../../features/devices';

function useLiveFrame(): { readonly live: boolean; readonly frame: WideFrame } {
  const ref = useRef<View>(null);
  const { live, onLayout } = useVisibleLive(ref);
  return { live, frame: { ref, onLayout } };
}

export function LiveCell({
  children,
}: {
  readonly children: (live: boolean, frame: WideFrame) => ReactNode;
}): ReactNode {
  const { live, frame } = useLiveFrame();
  return children(live, frame);
}
