import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { BrowserSurfaceProps } from '../../../platform/browser-contract';
import { retainBrowserSurface, layoutBrowserSurface } from './browser-runtime';
export function BrowserSurfaceSlot(
  props: BrowserSurfaceProps & { readonly chatId: string },
): ReactNode {
  const region = useRef<View>(null);
  const [owner] = useState(() => Symbol('browser-slot'));
  useEffect(() => retainBrowserSurface(props.chatId, props, owner), [props, owner]);
  const measure = (): void => {
    region.current?.measureInWindow((x, y, width, height) => {
      layoutBrowserSurface(props.target.id, { x, y, width, height }, owner);
    });
  };
  useEffect(measure, [props, owner]);
  return <View ref={region} collapsable={false} className="min-h-0 flex-1" onLayout={measure} />;
}
