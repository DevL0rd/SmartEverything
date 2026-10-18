import { useStableValue } from '../../../components/use-stable-value';
import { sameJson } from '../../../store/same-json';
import { useDeviceDerived, useSession } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import {
  accessOf,
  faceReadingsOf,
  faceWordOf,
  type FaceReadings,
  type FaceWord,
  type PhoneAccess,
} from '../model/face-model';

export interface PhoneControls {
  readonly device: Device;
  readonly online: boolean;
  readonly access: PhoneAccess;
  readonly ringing: boolean;
  readonly torchOn: boolean;
  readonly ringerMode: FaceReadings['ringerMode'];
  readonly dnd: boolean;
  readonly mediaVolume: number | null;
  readonly playing: boolean;
  readonly title: string | null;
}

export interface PhoneFaceData {
  readonly device: Device;
  readonly online: boolean;
  readonly readings: FaceReadings;
  readonly access: PhoneAccess;
  readonly word: FaceWord;
  readonly controls: PhoneControls;
}

function sameControls(left: PhoneControls, right: PhoneControls): boolean {
  return Object.entries(left).every(([key, value]) => Object.is(value, Reflect.get(right, key)));
}

function controlsOf(device: Device, access: PhoneAccess, readings: FaceReadings): PhoneControls {
  return {
    device,
    online: device.online,
    access,
    ringing: readings.ringing === true,
    torchOn: readings.flashlight === 'on',
    ringerMode: readings.ringerMode,
    dnd: readings.dnd === true,
    mediaVolume: readings.mediaVolume,
    playing: readings.playback === 'playing',
    title: readings.nowPlaying,
  };
}

export function usePhoneAccess(device: Device): PhoneAccess {
  const { client } = useSession();
  const clientId = device.details['clientId'];
  return useStableValue(
    accessOf(device, {
      profileId: client.profile_id,
      role: client.role,
      localDeviceId: clientId === client.id ? device.id : null,
    }),
    sameJson,
  );
}

export function usePhoneFace(device: Device): PhoneFaceData {
  const { online } = device;
  const readings = useDeviceDerived(
    device.id,
    (values) => faceReadingsOf(values, online),
    [online],
    sameJson,
  );
  const access = usePhoneAccess(device);
  const controls = useStableValue(controlsOf(device, access, readings), sameControls);
  return { device, online, readings, access, word: faceWordOf(readings, online), controls };
}
