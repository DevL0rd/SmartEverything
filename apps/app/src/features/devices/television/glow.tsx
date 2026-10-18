import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../../design/cn';
import { GLOW_CLASS } from './apps';
import type { Television } from './use-television';

export function Glow({ tv }: { readonly tv: Television }): ReactNode {
  const app = tv.view.mode === 'on' ? tv.view.app : null;
  if (app === null) {
    return null;
  }
  return (
    <View
      pointerEvents="none"
      className={cn('absolute -inset-5 bg-linear-to-br to-transparent', GLOW_CLASS[app.tone])}
    />
  );
}
