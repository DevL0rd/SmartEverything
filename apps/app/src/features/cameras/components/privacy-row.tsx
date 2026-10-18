import type { ReactNode } from 'react';
import { isPrivate, privacySwitchOf, type PrivacySwitch } from '@smarteverything/domain';
import { SwitchRow } from '../../../components/rows';
import { useControl } from '../../../store/control';
import type { CameraEntry } from '../logic/cameras';
import { background } from '@smarteverything/logging';

export function hasPrivacySwitch(entry: CameraEntry): boolean {
  return privacySwitchOf(entry.device)?.writable === true;
}

function Row({
  entry,
  privacy,
}: {
  readonly entry: CameraEntry;
  readonly privacy: PrivacySwitch;
}): ReactNode {
  const control = useControl(entry.device.id, privacy.key);
  return (
    <SwitchRow
      title="Privacy mode"
      subtitle="Stops the picture and sound"
      icon="eyeOff"
      value={isPrivate(privacy, control.value)}
      disabled={control.offline}
      onChange={(on) => {
        background(control.set(on === privacy.privateWhen), 'control.set_failed');
      }}
    />
  );
}

export function PrivacyRow({ entry }: { readonly entry: CameraEntry }): ReactNode {
  const privacy = privacySwitchOf(entry.device);
  return privacy === null ? null : <Row entry={entry} privacy={privacy} />;
}
