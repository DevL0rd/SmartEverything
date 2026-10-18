import type { ReactNode } from 'react';
import { ScopedTheme } from 'uniwind';
import { ColourPalette } from './colour-palette';
import type { ThemeName } from './tokens';

export function ThemeScope({
  theme,
  children,
}: {
  readonly theme: ThemeName;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <ScopedTheme theme={theme}>
      <ColourPalette>{children}</ColourPalette>
    </ScopedTheme>
  );
}
