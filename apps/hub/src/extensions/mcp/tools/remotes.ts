import {
  EMPTY_IR_REMOTE_STATE,
  type DeviceScope,
  type IrCodeRow,
  type IrRemoteRow,
  type IrRemoteState,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../../../store/store';
import { reported, sendAndWait } from './commanding';
import { deviceScopeOfActor } from './person-reach';
import { PHYSICAL, READS, defineTool, type Tool } from './registry';
import { inRooms, placedDevices, resolveNamed, type Placed } from './targets';

interface Remote {
  readonly row: IrRemoteRow;
  readonly blaster: Placed | undefined;
  readonly buttons: readonly IrCodeRow[];
}

function remotes(store: Store, scope: DeviceScope | null): Remote[] {
  const blasters = new Map(placedDevices(store, scope).map((placed) => [placed.device.id, placed]));
  const codes = store.infrared.codes();
  return store.infrared
    .remotes()
    .filter((row) => scope === null || blasters.has(row.blaster_id))
    .map((row) => ({
      row,
      blaster: blasters.get(row.blaster_id),
      buttons: codes.filter((code) => code.remote_id === row.id),
    }));
}

function where(blaster: Placed | undefined): Record<string, unknown> {
  if (blaster === undefined) {
    return { blaster: null, online: false, room: null, room_id: null };
  }
  return {
    blaster: blaster.name,
    online: blaster.device.online,
    room: blaster.room?.name ?? null,
    room_id: blaster.room?.id ?? null,
  };
}

function summary(
  { row, blaster, buttons }: Remote,
  assumed: IrRemoteState,
): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    brand: row.brand,
    blaster_id: row.blaster_id,
    ...where(blaster),
    buttons: buttons.map((button) => button.button),
    assumed,
  };
}

export const REMOTE_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'list_remotes',
    input: z.strictObject({
      rooms: z.array(z.string().min(1)).min(1).optional().describe('Room ids or names'),
    }),
    annotations: READS,
    run: (context, input) => {
      const { store } = context;
      const states = store.settings.read().ir_remotes;
      return {
        structured: {
          remotes: remotes(store, deviceScopeOfActor(context))
            .filter(
              (remote) =>
                input.rooms === undefined || inRooms(remote.blaster?.room ?? null, input.rooms),
            )
            .map((remote) => summary(remote, states[remote.row.id] ?? EMPTY_IR_REMOTE_STATE)),
        },
      };
    },
  }),
  defineTool({
    name: 'press_remote_button',
    input: z.strictObject({
      remote: z.string().min(1).describe('Remote id or name'),
      button: z.string().min(1).describe('Button name, such as Power or Temp +'),
    }),
    annotations: PHYSICAL,
    run: async (context, input) => {
      const remote = resolveNamed(
        remotes(context.store, deviceScopeOfActor(context)),
        input.remote,
        'remote',
        {
          names: (candidate) => [candidate.row.name],
          label: (candidate) => candidate.row.name,
          id: (candidate) => candidate.row.id,
        },
      );
      const button = resolveNamed(remote.buttons, input.button, `button on ${remote.row.name}`, {
        names: (code) => [code.button],
        label: (code) => code.button,
      });
      const outcome = await sendAndWait(context, [
        {
          device_id: remote.row.blaster_id,
          capability: 'ir_send',
          value: { format: button.format, code: button.code },
        },
      ]);
      return {
        structured: {
          remote: remote.row.name,
          button: button.button,
          ...reported(context, outcome),
        },
      };
    },
  }),
];
