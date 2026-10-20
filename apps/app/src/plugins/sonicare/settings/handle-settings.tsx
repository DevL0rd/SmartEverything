import type { ReactNode } from 'react';
import type { SettingsProps } from '../../toothbrush/settings/settings-props';
import { HandleList } from './handle-list';
import { PairingList } from './pairing-list';
import { SensorsList } from './sensors-list';

export function SonicareHandleSettings(props: SettingsProps): ReactNode {
  return (
    <>
      <SensorsList {...props} />
      <HandleList {...props} />
      <PairingList {...props} />
    </>
  );
}
