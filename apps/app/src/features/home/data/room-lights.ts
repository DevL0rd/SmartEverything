import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import type { LightsToggle } from '../model/rooms';

export async function setRoomLights(toggle: LightsToggle): Promise<void> {
  try {
    await api().call(E.sendTargetCommands, {
      body: { target: toggle.target, capability: 'power', value: toggle.on },
    });
  } catch (error) {
    notify({ message: toggle.failure, error, tone: 'critical' });
  }
}
