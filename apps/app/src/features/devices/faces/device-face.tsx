import type { ReactNode } from 'react';
import { useDevice } from '../../../store/selectors';
import { StandaloneShell } from '../card/standalone-shell';
import { deviceModelOf } from '../model/device-model';
import { renderFamilyFace } from '../../../app-shell/family-faces';
import { FAMILY_FACES } from './family-faces';
import type { FaceProps } from './face-types';
import { GenericFaceOf } from './generic-face';

export function DeviceFace({ deviceId, ...face }: FaceProps): ReactNode {
  const device = useDevice(deviceId);
  if (device === null) {
    return null;
  }
  const { family } = deviceModelOf(device);
  const registered =
    face.context === 'standalone' && (face.face === 'card' || face.face === 'panel')
      ? renderFamilyFace(family, device, face.face === 'card' ? 'm' : 'l')
      : null;
  if (registered !== null) {
    return (
      <StandaloneShell device={device} editing={false} quickControls={false} padded>
        {registered}
      </StandaloneShell>
    );
  }
  const Face = FAMILY_FACES[family] ?? GenericFaceOf;
  return <Face device={device} {...face} />;
}
