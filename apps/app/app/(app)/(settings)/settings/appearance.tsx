import type { ReactNode } from 'react';
import { AppearanceBlocks } from '../../../../src/features/settings/appearance/appearance-blocks';
import { SettingsPageScreen } from '../../../../src/settings/settings-screen';

export default function AppearanceRoute(): ReactNode {
  return (
    <SettingsPageScreen page="appearance" contentWidth="detail" BlocksLayout={AppearanceBlocks} />
  );
}
