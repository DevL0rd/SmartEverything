import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type VacuumRoomLinks } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { api } from '../../../../api/transport';
import { createRoom } from '../../../../api/settings';
import { notify } from '../../../../components/toast-store';
import { useScreenQuery } from '../../../../queries/use-screen-query';
import { useRooms } from '../../../../store/selectors';
import { vacuumDeviceScenesKey, vacuumRoomLinksKey } from './keys';
import { applyLinkChange, linkFailureText, type LinkChange } from './room-link-calls';
import { linksKeyPart, useRoomLinksValue } from './room-links-value';

const log = new Logger('app.devices');

export interface RoomLinksState {
  readonly links: VacuumRoomLinks | null;
  readonly failure: Error | null;
  readonly retry: () => void;
  readonly change: (change: LinkChange) => void;
  readonly busyRoom: number | null;
}

export function useVacuumRoomLinks(deviceId: string, mapVersion: string): RoomLinksState {
  const client = useQueryClient();
  const key = vacuumRoomLinksKey(deviceId, mapVersion, linksKeyPart(useRoomLinksValue(deviceId)));
  const position = useRooms().length;
  const query = useScreenQuery({
    queryKey: key,
    queryFn: (): Promise<VacuumRoomLinks> =>
      api().call(E.listVacuumRoomLinks, { params: { deviceId } }),
    staleTime: Infinity,
  });
  const mutation = useMutation({
    mutationFn: (change: LinkChange) =>
      applyLinkChange(
        { client: api(), createRoom: (name) => createRoom(name, position) },
        deviceId,
        change,
      ),
    onSuccess: (answer, change): void => {
      log.info('vacuum.room_links_changed', { deviceId, change: change.kind });
      client.setQueryData(key, answer);
      background(
        client.invalidateQueries({ queryKey: vacuumDeviceScenesKey(deviceId) }),
        'vacuum.scene_invalidate_failed',
        { deviceId },
      );
    },
    onError: (error, change): void => {
      log.error('vacuum.room_links_change_failed', error, { deviceId, change: change.kind });
      notify({ message: linkFailureText(change), error, tone: 'critical' });
    },
  });
  return {
    links: query.data ?? null,
    failure: query.isError ? query.error : null,
    retry: (): void => {
      background(query.refetch(), 'vacuum.room_links_refetch_failed', { deviceId });
    },
    change: mutation.mutate,
    busyRoom: mutation.isPending ? mutation.variables.mapRoomId : null,
  };
}
