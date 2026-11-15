import type { ReactNode } from 'react';
import { SettingsFrame } from '../../../../../src/settings/settings-frame';
import { SettingsPageBody } from '../../../../../src/settings/settings-page';

export default function LayoutsSettingsRoute(): ReactNode {
  return (
    <SettingsFrame page="home/layouts">
      <SettingsPageBody page="home/layouts" />
    </SettingsFrame>
  );
}
