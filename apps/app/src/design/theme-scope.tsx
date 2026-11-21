import { use, type ReactNode } from 'react';
import { ScopedTheme } from 'uniwind';
import { ColourPalette } from './colour-palette';
import { ScopedThemeName } from './theme-scope-context';
import type { ThemeName } from './tokens';

export function useScopedTheme(): ThemeName | null {
  return use(ScopedThemeName);
}

export function ThemeScope({
  theme,
  children,
}: {
  readonly theme: ThemeName;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <ScopedThemeName value={theme}>
      <ScopedTheme theme={theme}>
        <ColourPalette>{children}</ColourPalette>
      </ScopedTheme>
    </ScopedThemeName>
  );
}
