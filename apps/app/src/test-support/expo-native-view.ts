import type { ComponentType } from 'react';

export function requireNativeView<P>(viewName?: string): ComponentType<P> {
  const view = (): null => null;
  view.displayName = `NativeView(${viewName ?? 'unnamed'})`;
  return view;
}
