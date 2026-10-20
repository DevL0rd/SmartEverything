import { API_ENDPOINTS as E, type DeviceRow, type OralbIdentity } from '@smarteverything/domain';
import { actOnBrush } from '../../../api/toothbrushes';
import { api } from '../../../api/transport';

export interface NewOralb {
  readonly name: string;
  readonly room: string | null;
  readonly profileId: string | null;
  readonly model: string;
  readonly defaultModel: string;
  readonly identity: OralbIdentity;
}

export async function addOralb(brush: NewOralb): Promise<DeviceRow> {
  const device = await api().call(E.addLocalDevice, {
    body: {
      driver: 'oralb_io',
      source: 'bluetooth',
      name: brush.name,
      room: brush.room,
      profileId: brush.profileId,
      identity: brush.identity,
    },
  });
  if (brush.model !== brush.defaultModel) {
    await actOnBrush(device.id, {
      action: 'configure',
      settings: { oralb: { model: brush.model } },
    });
  }
  return device;
}
