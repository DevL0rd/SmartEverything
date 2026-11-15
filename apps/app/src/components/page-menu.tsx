import type { ReactNode } from 'react';
import { router } from 'expo-router';
import type { AppHref } from './app-href';
import { useHeaderPinItems } from './header-pin';
import { OverflowButton, type MenuItem } from './menu';

export interface PageSettingsLink {
  readonly href: AppHref;
  readonly label: string;
}

export type LateMenuItems = (() => readonly MenuItem[]) | null;

export interface PageMenuModel {
  readonly items: readonly MenuItem[];
  readonly late: LateMenuItems;
}

export function settingsMenuItemOf(settings: PageSettingsLink): MenuItem {
  return {
    id: 'page-settings',
    label: settings.label,
    icon: 'settings',
    onPress: (): void => {
      router.navigate(settings.href);
    },
  };
}

export function pageMenuOf(
  items: readonly MenuItem[],
  settings: PageSettingsLink | undefined,
  late: LateMenuItems,
): PageMenuModel | null {
  if (settings === undefined) {
    return items.length === 0 && late === null ? null : { items, late };
  }
  const entry = settingsMenuItemOf(settings);
  if (late === null) return { items: [...items, entry], late: null };
  return { items, late: (): readonly MenuItem[] => [...late(), entry] };
}

export function PageMenu({
  items,
  settings,
  label = 'More options',
}: {
  readonly items: readonly MenuItem[];
  readonly settings: PageSettingsLink | undefined;
  readonly label?: string;
}): ReactNode {
  const menu = pageMenuOf(items, settings, useHeaderPinItems());
  if (menu === null) return null;
  return <OverflowButton items={menu.items} late={menu.late} label={label} />;
}
