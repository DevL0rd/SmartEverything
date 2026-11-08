import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { API_ENDPOINTS as E, type HomeMapActor } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { api } from '../../../../api/transport';
import { notify } from '../../../../components/toast-store';
import { type HomeMapSaveStatus, saveText, useHomeMapEditing } from '../../../home-map';
import { unifiedMaterialOp, type UnifiedMap } from '../model/unified-map';

const log = new Logger('app.devices');

export interface RoomEdit {
  readonly floor?: number;
  readonly hidden?: boolean;
}

export interface EditRequest {
  readonly roomId: number;
  readonly roomName: string;
  readonly edit: RoomEdit;
}

export interface Edits {
  readonly send: (request: EditRequest) => void;
  readonly busyRoom: number | null;
}

export function useRoomEdits(deviceId: string): Edits {
  const mutation = useMutation({
    mutationFn: ({ roomId, edit }: EditRequest) =>
      api().call(E.setVacuumRoomSettings, {
        params: { deviceId, mapRoomId: String(roomId) },
        body: edit,
      }),
    onSuccess: (_reply, { roomId, edit }): void => {
      log.info('vacuum.room_edit_sent', { deviceId, roomId, fields: Object.keys(edit).join(',') });
    },
    onError: (error, { roomId, roomName, edit }): void => {
      log.error('vacuum.room_edit_failed', error, {
        deviceId,
        roomId,
        fields: Object.keys(edit).join(','),
      });
      notify({ message: `${roomName} was not changed`, error, tone: 'critical' });
    },
  });
  return {
    send: mutation.mutate,
    busyRoom: mutation.isPending ? mutation.variables.roomId : null,
  };
}

export function materialFailure(status: HomeMapSaveStatus): string | null {
  return status.kind === 'not_saved' || status.kind === 'conflicts' ? saveText(status) : null;
}

export function useUnifiedRoomEdits(
  deviceId: string,
  unified: UnifiedMap,
  actor: HomeMapActor,
): Edits {
  const robot = useRoomEdits(deviceId);
  const editing = useHomeMapEditing(actor);
  const [saving, setSaving] = useState<number | null>(null);
  const saveMaterial = async (request: EditRequest, floor: number): Promise<void> => {
    const op = unifiedMaterialOp(unified, request.roomId, floor);
    if (op === null) {
      robot.send(request);
      return;
    }
    setSaving(request.roomId);
    const status = await editing.edit([op]);
    setSaving(null);
    log.info('vacuum.room_material_on_map', {
      deviceId,
      roomId: request.roomId,
      status: status.kind,
    });
    const failure = materialFailure(status);
    if (failure !== null) notify({ message: `${request.roomName}: ${failure}`, tone: 'critical' });
  };
  return {
    send: (request): void => {
      const { floor, ...rest } = request.edit;
      if (floor === undefined) {
        robot.send(request);
        return;
      }
      background(saveMaterial(request, floor), 'vacuum.room_material_failed', { deviceId });
      if (rest.hidden !== undefined) robot.send({ ...request, edit: rest });
    },
    busyRoom: saving ?? robot.busyRoom,
  };
}
