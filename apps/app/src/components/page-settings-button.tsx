import type { ReactNode } from 'react';
import type { Href } from 'expo-router';
import { useIdiom } from '../design/platform';
import { IconButton } from './icon-button';

export interface PageSettingsLink {
  readonly href: Href;
  readonly label: string;
}

export function PageSettingsButton({
  settings,
}: {
  readonly settings: PageSettingsLink;
}): ReactNode {
  const touch = useIdiom() === 'touch';
  return (
    <IconButton
      icon={touch ? 'ellipsisVertical' : 'ellipsis'}
      label={settings.label}
      href={settings.href}
    />
  );
}
