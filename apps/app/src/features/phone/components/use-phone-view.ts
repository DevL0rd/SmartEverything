import type { PhoneView } from '@smarteverything/domain';
import { useStableValue } from '../../../components/use-stable-value';
import { sameJson } from '../../../store/same-json';
import { useSession } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { accessOf } from '../model/face-model';

export function usePhoneView(device: Device): PhoneView {
  const { client } = useSession();
  const clientId = device.details['clientId'];
  return useStableValue(
    accessOf(device, {
      profileId: client.profile_id,
      role: client.role,
      localDeviceId: clientId === client.id ? device.id : null,
    }).view,
    sameJson,
  );
}
