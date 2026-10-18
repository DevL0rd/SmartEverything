import { API_ENDPOINTS as E, type DeviceGroupRow } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { confirm } from '../../../components/confirm-store';

export async function confirmRemoval(
  group: DeviceGroupRow,
  automations: readonly string[],
): Promise<boolean> {
  const used =
    automations.length === 0
      ? 'No automations use this group.'
      : `Used by ${automations.join(', ')}. They will show a removed group and need a new target.`;
  return confirm({
    title: `Remove ${group.name}?`,
    body: `${used} Its devices keep their settings.`,
    confirmLabel: 'Remove group',
    tone: 'destructive',
  });
}

export async function removeGroup(group: DeviceGroupRow): Promise<void> {
  await api().call(E.removeDeviceGroup, { params: { groupId: group.id } });
}
