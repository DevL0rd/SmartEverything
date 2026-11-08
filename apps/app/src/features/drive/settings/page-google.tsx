import type { ReactNode } from 'react';
import { DriveSettingsSection, DriveSettingsStub } from './page';

export function GoogleSection(): ReactNode {
  return (
    <DriveSettingsSection section="google">
      <DriveSettingsStub section="google" />
    </DriveSettingsSection>
  );
}
